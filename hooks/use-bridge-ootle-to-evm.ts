import { ApiError, OotleWrapTokenService, UserTransactionDTO } from '@tari-project/wxtm-bridge-backend-api'
import i18next from 'i18next'
import { isAddress } from 'viem'

import TariL1Signer, { BridgeTxDetails } from '@/clients/tari-l1-signer'
import {
  getOotleTransactionOutcome,
  isOotleSendRefused,
  sendOotleStealth,
  waitOotleTransaction,
} from '@/clients/tari-ootle-signer'
import {
  clearOotleWrapToResume,
  refreshOotleBalance,
  setLastOngoingBridgeTx,
  useTariAccountStore,
} from '@/store/account'
import {
  claimBridgeStart,
  lockOotleWrapInFlight,
  releaseBridgeStart,
  releaseOotleWrapInFlight,
  setBridgeError,
  setUnconfirmedError,
  useBridgeStore,
} from '@/store/bridge'
import useTariSigner from '@/store/signer'
import { AssetConfig } from '@/utils/bridge-route'
import { parseWxtmTokenAmount } from '@/utils/parse-wxtm-token-amount'
import { errorSummary } from '@/utils/error-summary'
import { isSameTransaction } from '@/utils/ootle-wrap-reference'
import { useBridgeTransaction } from './use-bridge-transaction'
import { useWalletUtils } from './use-wallet'

// Universe caps one wait at 600s; a deposit still pending after this stays stored and is resumed on the next load.
const WAIT_TIMEOUT_SECS = 600
export const WAIT_ATTEMPTS = 3

// The backend's answer once the wrap has left CREATED, e.g. after it already saw the deposit.
const TRANSACTION_STATUS_INCORRECT = 'Transaction status is incorrect'

// False once another transaction has become the ongoing one, so a late result can't overwrite it.
function isStillOngoing(tx: BridgeTxDetails): boolean {
  const ongoing = useTariAccountStore.getState().ongoingBridgeTx
  return !ongoing || isSameTransaction(ongoing, tx.paymentId)
}

// Shows the failure modal with the paymentId.
function showWrapFailed(tx: BridgeTxDetails) {
  setLastOngoingBridgeTx({
    destinationAddress: tx.destinationAddress,
    tokenAmount: parseWxtmTokenAmount(tx.amount),
    amountAfterFee: parseWxtmTokenAmount(tx.amountToReceive),
    status: UserTransactionDTO.status.TIMEOUT,
    createdAt: new Date().toISOString(),
    paymentId: tx.paymentId,
    showModal: true,
    type: 'wrap',
    ootleChainId: tx.chainId,
  })
}

// Shows that the deposit isn't confirmed; the record stays in TU for a retry. Without a transaction id
// the send never answered, so the deposit may or may not have been sent.
function showWrapUnconfirmed(tx: BridgeTxDetails) {
  if (!isStillOngoing(tx)) return
  const t = i18next.getFixedT(null, 'main')
  setUnconfirmedError(t(tx.ootleTransactionId ? 'ootle_wrap_unconfirmed' : 'ootle_wrap_maybe_sent'), tx.paymentId)
  // reopen the modal if the user closed it during the wait
  const ongoing = useTariAccountStore.getState().ongoingBridgeTx
  if (ongoing) setLastOngoingBridgeTx({ ...ongoing, showModal: true })
}

// Removes TU's record only when it is this paymentId's, whatever the tapplet is currently showing.
// Universe has no compare-and-remove, so this is a read then remove.
export async function removeStoredWrap(signer: TariL1Signer | null | undefined, paymentId: string | undefined) {
  if (!signer || !paymentId) return
  try {
    const stored = await signer.getOngoingBridgeTx()
    if (stored?.paymentId === paymentId) await signer.removeOngoingBridgeTx()
  } catch (error) {
    console.error('[ TAPPLET-BRIDGE ] Could not remove the stored bridge tx: ', errorSummary(error))
  }
}

// First write of a new wrap's record. Refuses when TU holds another wrap's clientToken, which is that
// wrap's only recovery path; a record without one (a finished bridge kept for display) may be replaced.
export async function claimStoredWrap(signer: TariL1Signer, record: BridgeTxDetails): Promise<boolean> {
  const stored = await signer.getOngoingBridgeTx()
  if (stored?.clientToken && stored.paymentId !== record.paymentId) {
    console.warn('[ TAPPLET-BRIDGE ] TU holds another unconfirmed Ootle wrap; not starting this one')
    return false
  }
  await signer.setOngoingBridgeTx(record)
  return true
}

// Writes TU's record only when the slot is empty or already holds this wrap, so another bridge's
// record is never overwritten.
async function writeStoredWrap(signer: TariL1Signer, record: BridgeTxDetails): Promise<void> {
  const stored = await signer.getOngoingBridgeTx()
  if (stored && stored.paymentId !== record.paymentId) {
    console.warn('[ TAPPLET-BRIDGE ] TU holds another bridge tx; not updating the Ootle wrap record')
    return
  }
  await signer.setOngoingBridgeTx(record)
}

// The message key ('' if none) for why no new bridge may start: an Ootle wrap is in flight, or TU still
// holds an unconfirmed one. TU is only checked while the Ootle bridge is loaded.
export async function getUnfinishedOotleWrapError(signer: TariL1Signer): Promise<string> {
  if (useBridgeStore.getState().ootleWrapInFlightId) return 'ootle_wrap_unfinished'
  if (!useTariAccountStore.getState().ootleAccount) return ''
  try {
    const stored = await signer.getOngoingBridgeTx()
    if (stored?.network === 'Ootle' && stored.clientToken) return 'ootle_wrap_unfinished'
  } catch (error) {
    console.error('[ TAPPLET-BRIDGE ] Could not read the ongoing bridge tx: ', errorSummary(error))
    return 'ootle_wrap_check_failed'
  }
  return ''
}

export const useBridgeOotleToEvm = () => {
  const signer = useTariSigner((s) => s.signer)
  const ootleAccount = useTariAccountStore((s) => s.ootleAccount)
  const coldAccountAddress = useBridgeStore((s) => s.ootleColdAccountAddress)
  const { addTokenToWalletAction, isWalletOnChain } = useWalletUtils()
  const { getUserBackendBridgeTxs } = useBridgeTransaction()

  // Waits for the deposit and, only once it is Accepted, marks the wrap as sent.
  // Throws when the deposit can't be confirmed (e.g. Universe stopped answering); the record then stays.
  const finishOotleWrap = async (tx: BridgeTxDetails, asset?: AssetConfig, attempts = WAIT_ATTEMPTS) => {
    if (!signer || !tx.clientToken || !tx.ootleTransactionId) return

    // Another wrap is between deposit and tokens-sent; it owns the lock and TU's slot.
    if (!lockOotleWrapInFlight(tx.paymentId)) return
    try {
      await waitAndConfirm(tx, asset, attempts)
    } finally {
      releaseOotleWrapInFlight(tx.paymentId)
    }
  }

  const waitAndConfirm = async (tx: BridgeTxDetails, asset: AssetConfig | undefined, attempts: number) => {
    if (!signer || !tx.clientToken || !tx.ootleTransactionId) return

    let status = 'Pending'
    let outcome = getOotleTransactionOutcome(status)
    for (let i = 0; i < attempts && outcome === 'pending'; i++) {
      const result = await waitOotleTransaction(tx.ootleTransactionId, WAIT_TIMEOUT_SECS)
      status = result.status
      outcome = getOotleTransactionOutcome(status)
    }

    if (outcome === 'pending') {
      console.warn(`[ TAPPLET-BRIDGE ] Ootle deposit ${tx.paymentId} still ${status}`)
      showWrapUnconfirmed(tx)
      return
    }
    if (outcome === 'failed' || outcome === 'fee_only') {
      console.error(`[ TAPPLET-BRIDGE ] Ootle deposit ${tx.paymentId} ended as ${status}`)
      // The wrap is dead: drop its record (and clientToken) from TU so it no longer blocks new bridges.
      clearOotleWrapToResume()
      await removeStoredWrap(signer, tx.paymentId)
      // shown even when another tx is displayed, so a failed retry is never closed silently
      setBridgeError(outcome === 'fee_only' ? i18next.getFixedT(null, 'main')('ootle_wrap_fee_only') : '')
      showWrapFailed(tx)
      return
    }

    try {
      await OotleWrapTokenService.updateOotleToTokensSent(tx.paymentId, {
        clientToken: tx.clientToken,
        ootleTransactionId: tx.ootleTransactionId,
      })
    } catch (error) {
      const alreadySent =
        error instanceof ApiError && error.status === 400 && error.body?.message === TRANSACTION_STATUS_INCORRECT
      if (!alreadySent) throw error
      console.info('[ TAPPLET-BRIDGE ] Ootle wrap already past tokens-sent: ', tx.paymentId)
    }

    // Confirmed: new bridges may start while the follow-ups (e.g. a wallet prompt) run.
    releaseOotleWrapInFlight(tx.paymentId)
    clearOotleWrapToResume()

    // The wrap is confirmed; failures below are only logged.
    try {
      // The clientToken is no longer needed; keep the rest so a reload can still show the outcome.
      await writeStoredWrap(signer, {
        amount: tx.amount,
        amountToReceive: tx.amountToReceive,
        destinationAddress: tx.destinationAddress,
        paymentId: tx.paymentId,
        network: 'Ootle',
        chainId: tx.chainId,
      })
      await refreshOotleBalance()
      await getUserBackendBridgeTxs()

      if (asset && isWalletOnChain(asset.chainId)) {
        await addTokenToWalletAction(asset)
      }
    } catch (error) {
      console.error('[ TAPPLET-BRIDGE ] Ootle wrap follow-up failed: ', errorSummary(error))
    }
  }

  const bridgeOotleToEvm = async ({
    amount,
    evmAddress,
    amountAfterFee,
    asset,
  }: {
    amount: string
    evmAddress: string
    amountAfterFee: string
    asset: AssetConfig
  }) => {
    if (!ootleAccount || !signer) return
    const t = i18next.getFixedT(null, 'main')

    if (!isAddress(evmAddress)) {
      setBridgeError(t('invalid_evm_address'))
      return
    }

    // Claimed before the first await and held to the end, so a second start can't pass the checks
    // below while this one is creating or storing its wrap.
    const startId = claimBridgeStart()
    if (!startId) {
      setBridgeError(t('bridge_start_in_progress'))
      return
    }
    try {
      await startOotleWrap({ amount, evmAddress, amountAfterFee, asset })
    } finally {
      releaseBridgeStart(startId)
    }
  }

  const startOotleWrap = async ({
    amount,
    evmAddress,
    amountAfterFee,
    asset,
  }: {
    amount: string
    evmAddress: string
    amountAfterFee: string
    asset: AssetConfig
  }) => {
    if (!ootleAccount || !signer) return
    const t = i18next.getFixedT(null, 'main')

    const unfinished = await getUnfinishedOotleWrapError(signer)
    if (unfinished) {
      setBridgeError(t(unfinished))
      return
    }

    const tokenAmount = parseWxtmTokenAmount(amount)

    let created
    try {
      created = await OotleWrapTokenService.createOotleWrapTokenTransaction({
        from: ootleAccount.address,
        to: evmAddress,
        toChainId: asset.chainId,
        tokenAmount,
      })
    } catch (error) {
      // 403 is the daily limit, which the caller shows.
      if (error instanceof ApiError && error.status === 403) throw error
      console.error('[ TAPPLET-BRIDGE ] Ootle wrap creation failed: ', errorSummary(error))
      if (error instanceof ApiError && error.status === 429) {
        setBridgeError(t('ootle_too_many_open_wraps'))
      } else {
        setBridgeError(t('ootle_wrap_error'))
      }
      return
    }
    const { paymentId, clientToken } = created

    const tx: BridgeTxDetails = {
      amount,
      amountToReceive: amountAfterFee,
      destinationAddress: evmAddress,
      paymentId,
      network: 'Ootle',
      chainId: asset.chainId,
      clientToken,
    }

    // Held from before the record is stored until the wait takes over, so no other bridge starts.
    // Fails only if a resumed wrap took it meanwhile; nothing has been sent, so this one just stops.
    if (!lockOotleWrapInFlight(paymentId)) {
      setBridgeError(t('ootle_wrap_unfinished'))
      showWrapFailed(tx)
      return
    }
    try {
      // set ongoing to immediately display wrap modal
      setLastOngoingBridgeTx({
        destinationAddress: evmAddress,
        tokenAmount,
        amountAfterFee: parseWxtmTokenAmount(amountAfterFee),
        status: UserTransactionDTO.status.PENDING,
        createdAt: new Date().toISOString(),
        paymentId,
        showModal: true,
        type: 'wrap',
        ootleChainId: asset.chainId,
      })
      console.debug('[ TAPPLET-BRIDGE ] created Ootle wrap with id: ', paymentId)

      // Stored in TU before the deposit, so the clientToken survives whatever happens to the send.
      // Never replaces another wrap's clientToken.
      try {
        if (!(await claimStoredWrap(signer, tx))) {
          setBridgeError(t('ootle_wrap_unfinished'))
          showWrapFailed(tx)
          return
        }
      } catch (error) {
        console.error('[ TAPPLET-BRIDGE ] Could not store the Ootle wrap: ', errorSummary(error))
        showWrapFailed(tx)
        return
      }

      try {
        const { transactionId } = await sendOotleStealth({
          amount: tokenAmount,
          address: coldAccountAddress,
          payRef: paymentId,
        })
        tx.ootleTransactionId = transactionId
      } catch (error) {
        console.error('[ TAPPLET-BRIDGE ] Ootle deposit failed: ', errorSummary(error))
        if (isOotleSendRefused(error)) {
          // nothing was sent
          await removeStoredWrap(signer, paymentId)
          showWrapFailed(tx)
        } else {
          // timed out or failed inside Universe: the deposit may still have gone out
          showWrapUnconfirmed(tx)
        }
        return
      }

      try {
        await writeStoredWrap(signer, tx)
        await getUserBackendBridgeTxs()
        await finishOotleWrap(tx, asset)
      } catch (error) {
        // The deposit was sent; keep the stored tx so a later retry can confirm it.
        console.error('[ TAPPLET-BRIDGE ] Could not confirm the Ootle deposit: ', errorSummary(error))
        showWrapUnconfirmed(tx)
      }
    } finally {
      releaseOotleWrapInFlight(paymentId)
    }
  }

  return {
    bridgeOotleToEvm,
    finishOotleWrap,
    showWrapUnconfirmed,
  }
}
