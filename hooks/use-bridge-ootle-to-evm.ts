import { ApiError, OotleWrapTokenService, UserTransactionDTO } from '@tari-project/wxtm-bridge-backend-api'
import i18next from 'i18next'
import { isAddress } from 'viem'
import { useConnection } from 'wagmi'

import { BridgeTxDetails } from '@/clients/tari-l1-signer'
import { sendOotleStealth, waitOotleTransaction } from '@/clients/tari-ootle-signer'
import { refreshOotleBalance, setLastOngoingBridgeTx, useTariAccountStore } from '@/store/account'
import { setBridgeError, useBridgeStore } from '@/store/bridge'
import useTariSigner from '@/store/signer'
import { AssetConfig } from '@/utils/bridge-route'
import { parseWxtmTokenAmount } from '@/utils/parse-wxtm-token-amount'
import { errorSummary } from '@/utils/error-summary'
import { useBridgeTransaction } from './use-bridge-transaction'
import { useWalletUtils } from './use-wallet'

// Universe caps one wait at 600s; a deposit still pending after this stays stored and is resumed on the next load.
const WAIT_TIMEOUT_SECS = 600
const WAIT_ATTEMPTS = 3

// The backend's answer once the wrap has left CREATED, e.g. after it already saw the deposit.
const TRANSACTION_STATUS_INCORRECT = 'Transaction status is incorrect'

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

export const useBridgeOotleToEvm = () => {
  const signer = useTariSigner((s) => s.signer)
  const ootleAccount = useTariAccountStore((s) => s.ootleAccount)
  const coldAccountAddress = useBridgeStore((s) => s.ootleColdAccountAddress)
  const { chain } = useConnection()
  const { addTokenToWalletAction } = useWalletUtils()
  const { getUserBackendBridgeTxs } = useBridgeTransaction()

  // Waits for the deposit and, only once it is Accepted, marks the wrap as sent.
  const finishOotleWrap = async (tx: BridgeTxDetails, asset?: AssetConfig) => {
    if (!signer || !tx.clientToken || !tx.ootleTransactionId) return

    let status = 'Pending'
    for (let i = 0; i < WAIT_ATTEMPTS && status === 'Pending'; i++) {
      const result = await waitOotleTransaction(tx.ootleTransactionId, WAIT_TIMEOUT_SECS)
      status = result.status
    }

    if (status === 'Pending') {
      console.warn('[ TAPPLET-BRIDGE ] Ootle deposit still pending: ', tx.paymentId)
      return
    }
    if (status !== 'Accepted') {
      console.error(`[ TAPPLET-BRIDGE ] Ootle deposit ${tx.paymentId} ended as ${status}`)
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

    // The clientToken is no longer needed; keep the rest so a reload can still show the outcome.
    await signer.setOngoingBridgeTx({
      amount: tx.amount,
      amountToReceive: tx.amountToReceive,
      destinationAddress: tx.destinationAddress,
      paymentId: tx.paymentId,
      network: 'Ootle',
      chainId: tx.chainId,
    })
    await refreshOotleBalance()
    await getUserBackendBridgeTxs()

    if (asset && chain?.id === asset.chainId) {
      await addTokenToWalletAction(asset)
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

    const tx: BridgeTxDetails = {
      amount,
      amountToReceive: amountAfterFee,
      destinationAddress: evmAddress,
      paymentId,
      network: 'Ootle',
      chainId: asset.chainId,
      clientToken,
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
      showWrapFailed(tx)
      return
    }

    // stored in TU so a reload between the deposit and tokens-sent can still finish
    try {
      await signer.setOngoingBridgeTx(tx)
      await getUserBackendBridgeTxs()
      await finishOotleWrap(tx, asset)
    } catch (error) {
      // The deposit was sent; keep the stored tx so the next load can retry tokens-sent.
      console.error('[ TAPPLET-BRIDGE ] Could not confirm the Ootle deposit: ', errorSummary(error))
      setBridgeError(t('ootle_wrap_unconfirmed'))
    }
  }

  return {
    bridgeOotleToEvm,
    finishOotleWrap,
  }
}
