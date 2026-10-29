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
import { useBridgeTransaction } from './use-bridge-transaction'
import { useWalletUtils } from './use-wallet'

// Universe caps one wait at 600s; a deposit still pending after this stays stored and is resumed on the next load.
const WAIT_TIMEOUT_SECS = 600
const WAIT_ATTEMPTS = 3

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

    await OotleWrapTokenService.updateOotleToTokensSent(tx.paymentId, {
      clientToken: tx.clientToken,
      ootleTransactionId: tx.ootleTransactionId,
    })

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
      if (error instanceof ApiError && error.status === 429) {
        setBridgeError(t('ootle_too_many_open_wraps'))
        return
      }
      throw error
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
      console.error('[ TAPPLET-BRIDGE ] Ootle deposit failed: ', error)
      showWrapFailed(tx)
      return
    }

    // stored in TU so a reload between the deposit and tokens-sent can still finish
    await signer.setOngoingBridgeTx(tx)
    await getUserBackendBridgeTxs()

    await finishOotleWrap(tx, asset)
  }

  return {
    bridgeOotleToEvm,
    finishOotleWrap,
  }
}
