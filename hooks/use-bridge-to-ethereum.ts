import { useMutation } from '@tanstack/react-query'

import { UpdateToTokensSentReqDTO, UserTransactionDTO, WrapTokenService } from '@tari-project/wxtm-bridge-backend-api'

import {
  claimBridgeStart,
  releaseBridgeStart,
  useBridgeStore,
  setBridgeError,
  setTariColdWalletAddress,
  setUnconfirmedError,
  setWrapTokenFeePercentageBps,
} from '@/store/bridge'
import { claimStoredWrap, getUnfinishedOotleWrapError } from './use-bridge-ootle-to-evm'
import { SignerTimeoutError } from '@/clients/tari-l1-signer'
import i18next from 'i18next'
import useTariSigner from '@/store/signer'
import { parseWxtmTokenAmount } from '@/utils/parse-wxtm-token-amount'
import { stringifyProperties } from '@/utils/stringifyProperties'
import { useBridgeTransaction } from './use-bridge-transaction'
import { setLastOngoingBridgeTx, useTariAccountStore } from '@/store/account'

export const useBridgeToEthereum = () => {
  const createTransaction = useMutation({
    mutationFn: WrapTokenService.createWrapTokenTransaction,
  })
  const confirmTokenSent = useMutation({
    mutationFn: async ({ paymentId, requestBody }: { paymentId: string; requestBody?: UpdateToTokensSentReqDTO }) =>
      WrapTokenService.updateToTokensSent(paymentId, requestBody),
  })
  const getWrapTokenParams = useMutation({
    mutationFn: WrapTokenService.getWrapTokenParams,
  })
  const { getUserBackendBridgeTxs } = useBridgeTransaction()
  const signer = useTariSigner((s) => s.signer)
  const tariAccount = useTariAccountStore((s) => s.tariAccount)
  const tariColdWalletAddress = useBridgeStore((s) => s.tariColdWalletAddress)

  type WrapArgs = { amount: string; ethAddress: `0x${string}`; amountAfterFee: string }

  // Shares the start claim with Ootle wraps: both write Universe's single ongoing-tx slot.
  const bridgeToEthereum = async (args: WrapArgs) => {
    if (!tariAccount || !signer) return
    const startId = claimBridgeStart()
    if (!startId) {
      setBridgeError(i18next.getFixedT(null, 'main')('bridge_start_in_progress'))
      return
    }
    try {
      await startWxtmWrap(args)
    } finally {
      releaseBridgeStart(startId)
    }
  }

  const startWxtmWrap = async ({ amount, ethAddress, amountAfterFee }: WrapArgs) => {
    if (!tariAccount || !signer) return

    // Universe keeps one ongoing tx; don't overwrite an Ootle wrap that is still being confirmed.
    const unfinished = await getUnfinishedOotleWrapError(signer)
    if (unfinished) {
      setBridgeError(i18next.getFixedT(null, 'main')(unfinished))
      return
    }

    const parsedAmount = parseWxtmTokenAmount(amount)

    const baseNodeStatusBefore = await signer?.getBaseNodeStatus()
    const { paymentId } = await createTransaction.mutateAsync({
      to: ethAddress,
      from: tariAccount.address,
      tokenAmount: parsedAmount,
      debug: stringifyProperties(baseNodeStatusBefore),
    })

    // set ongoing to immediately display wrap modal
    setLastOngoingBridgeTx({
      destinationAddress: ethAddress,
      tokenAmount: parsedAmount,
      amountAfterFee: parseWxtmTokenAmount(amountAfterFee),
      status: UserTransactionDTO.status.PENDING,
      createdAt: new Date().toISOString(),
      paymentId: paymentId,
      showModal: true,
      type: 'wrap',
    })
    console.debug('[ TAPPLET-BRIDGE ] created tx with id: ', paymentId)

    // add this line to store ongoing tx also in the TU to check on tapplet reload
    // if any previous tx was finished with success/fail status to display it to a user;
    // stored before the send so a send that never answers still leaves a record
    // Never replaces an Ootle wrap's clientToken; nothing has been sent yet, so stop here.
    const stored = await claimStoredWrap(signer, {
      amount: amount,
      amountToReceive: amountAfterFee,
      destinationAddress: ethAddress,
      paymentId: paymentId,
    })
    if (!stored) {
      setBridgeError(i18next.getFixedT(null, 'main')('ootle_wrap_unfinished'))
      setLastOngoingBridgeTx({
        destinationAddress: ethAddress,
        tokenAmount: parsedAmount,
        amountAfterFee: parseWxtmTokenAmount(amountAfterFee),
        status: UserTransactionDTO.status.TIMEOUT,
        createdAt: new Date().toISOString(),
        paymentId,
        showModal: true,
        type: 'wrap',
      })
      return
    }

    // the amount is parsed in TU in the `send_one_sided_to_stealth_address` function
    // so here it is necessary to pass the value entered by the user as is
    let isSend
    try {
      isSend = await signer?.sendOneSided({
        amount: amount,
        address: tariColdWalletAddress,
        paymentId: paymentId,
      })
    } catch (error) {
      if (!(error instanceof SignerTimeoutError)) throw error
      // Universe may still have sent it: don't report a failure, ask the user to check first
      console.error('[ TAPPLET-BRIDGE ] send one sided timed out')
      setUnconfirmedError(i18next.getFixedT(null, 'main')('wrap_unconfirmed'), paymentId)
      const ongoing = useTariAccountStore.getState().ongoingBridgeTx
      if (ongoing) setLastOngoingBridgeTx({ ...ongoing, showModal: true })
      return
    }

    // get user txs to update history immediately after the tx starts
    await getUserBackendBridgeTxs()

    if (!isSend) {
      console.error('[ TAPPLET-BRIDGE ] send one sided failed')
    }

    const baseNodeStatusAfter = await signer?.getBaseNodeStatus()
    const { success } = await confirmTokenSent.mutateAsync({
      paymentId,
      requestBody: {
        debug: stringifyProperties(baseNodeStatusAfter),
      },
    })
    if (!success) {
      console.error('[ TAPPLET-BRIDGE ] confirm token sent failed')
    }
  }

  const getBridgeTxParams = async () => {
    try {
      const { coldWalletAddress, wrapTokenFeePercentageBps } = await getWrapTokenParams.mutateAsync()

      setTariColdWalletAddress(coldWalletAddress)
      setWrapTokenFeePercentageBps(wrapTokenFeePercentageBps)
    } catch (error) {
      console.error('[ TAPPLET-BRIDGE ] Failed to fetch token params:', error)
    }
  }

  return {
    bridgeToEthereum,
    getBridgeTxParams,
  }
}
