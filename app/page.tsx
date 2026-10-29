'use client'
import React, { useCallback, useEffect, useEffectEvent, useState } from 'react'
import { FormProvider, useForm, useWatch } from 'react-hook-form'
import { useConnection } from 'wagmi'
import './i18initializer'

import { BridgeFormValues } from '@/components/bridge-input'
import { Header } from '@/components/header'
import { MainComponent } from '@/components/main'
import { MainModal } from '@/components/modals/main-modal'
import { TransactionDetailsModal } from '@/components/modals/transaction-details-modal'
import { useBridgeFees } from '@/hooks/use-bridge-fees'
import { useBridgeToEthereum } from '@/hooks/use-bridge-to-ethereum'

import { useBridgeTransaction } from '@/hooks/use-bridge-transaction'
import { clearOotleWrapToResume, setDetailedTx, setLastOngoingBridgeTx, useTariAccountStore } from '@/store/account'
import { UserTransactionDTO } from '@tari-project/wxtm-bridge-backend-api'
import { FooterText } from '@/components/main/footer-text'
import { setBridgeError, setUnwrapFailed, useBridgeStore } from '@/store/bridge'
import { useFetchDailyLimit } from '@/hooks/use-fetch-daily-limit'
import { setIsModalOpen, setModalStep, useModalStore } from '@/store/modal'
import { useBridgeRoute } from '@/hooks/use-bridge-route'
import { useBridgeOotleToEvm } from '@/hooks/use-bridge-ootle-to-evm'
import { errorSummary } from '@/utils/error-summary'

const REFETCH_LIMIT_INTERVAL = 30 * 1000 // 30 sec

export default function Home() {
  const modalStep = useModalStore((s) => s.modalStep)
  const isModalOpen = useModalStore((s) => s.isModalOpen)
  const detailedTx = useTariAccountStore((s) => s.detailedTx)
  const tariAccount = useTariAccountStore((s) => s.tariAccount)
  const ootleAccount = useTariAccountStore((s) => s.ootleAccount)
  const ootleWrapToResume = useTariAccountStore((s) => s.ootleWrapToResume)
  const ongoingBridgeTx = useTariAccountStore((s) => s.ongoingBridgeTx)
  const tariColdWalletAddress = useBridgeStore((s) => s.tariColdWalletAddress)
  const wrapTokenFeePercentageBps = useBridgeStore((s) => s.wrapTokenFeePercentageBps)
  const isUnwrappingFailed = useBridgeStore((s) => s.unwrapFailed)
  const unwrapSuccess = useBridgeStore((s) => s.unwrapSuccess)
  const bridgeError = useBridgeStore((s) => s.bridgeError)
  const { route } = useBridgeRoute()
  const { asset, isWrapping } = route
  const tariSideAddress = asset.tariNetwork === 'Ootle' ? ootleAccount?.address : tariAccount?.address

  const fetchDailyLimit = useFetchDailyLimit(asset)
  const { finishOotleWrap } = useBridgeOotleToEvm()
  const { isConnected, address: ethAddress } = useConnection()
  const { getUserBackendBridgeTxs } = useBridgeTransaction()
  const { getBridgeTxParams } = useBridgeToEthereum()
  const methods = useForm<BridgeFormValues>({
    defaultValues: { amount: '' },
    mode: 'onChange',
  })
  const { control, resetField } = methods
  const amount = useWatch({ control, name: 'amount' })

  const [hasFetchedParams, setHasFetchedParams] = useState(false)
  const [remainingDailyLimit, setRemainingDailyLimit] = useState<number | undefined>(undefined)

  // Prevent main modal from showing when transaction details modal is active
  const showModalDetailedTx = !!detailedTx
  const showModalOngoingTx = ongoingBridgeTx && ongoingBridgeTx.showModal
  const isFailed =
    ongoingBridgeTx?.status === UserTransactionDTO.status.TIMEOUT || isUnwrappingFailed || bridgeError !== ''
  const isWrapSuccess = ongoingBridgeTx?.status === UserTransactionDTO.status.SUCCESS

  const decimals = isWrapping ? asset.tariDecimals : asset.evmDecimals
  const feeBps = isWrapping ? asset.wrapFeeBps : asset.unwrapFeeBps
  const feesData = useBridgeFees(amount, decimals, feeBps, asset.highThreshold)

  const fetchUserTransactions = useCallback(async () => {
    if (tariAccount) {
      try {
        await getUserBackendBridgeTxs()
      } catch (error) {
        console.error('[ TAPPLET-BRIDGE ] Failed to get user transactions:', error)
      }
    }
  }, [getUserBackendBridgeTxs, tariAccount])

  const onNetworkChange = useEffectEvent(() => setRemainingDailyLimit(undefined))
  const onOotleAccountReady = useEffectEvent(() => fetchUserTransactions())
  const onFetchedParams = useEffectEvent((hasFetched: boolean) => setHasFetchedParams(hasFetched))

  useEffect(() => {
    if (!tariAccount || hasFetchedParams) return
    const fetchBridgeTxParams = async () => {
      try {
        await getBridgeTxParams()
        setHasFetchedParams(true)
      } catch (error) {
        console.error('[ TAPPLET-BRIDGE ] Failed to get bridge transaction params:', error)
      }
    }

    fetchBridgeTxParams().then(
      async () => await fetchUserTransactions(), //initial
    )
  }, [fetchUserTransactions, getBridgeTxParams, hasFetchedParams, tariAccount])

  useEffect(() => {
    const hasFetched = Boolean(!!tariColdWalletAddress?.length || !!wrapTokenFeePercentageBps)
    onFetchedParams(hasFetched)
  }, [tariColdWalletAddress?.length, wrapTokenFeePercentageBps])

  useEffect(() => {
    // Poll every 5 min
    const intervalId = setInterval(fetchUserTransactions, 1000 * 60 * 5)
    return () => {
      clearInterval(intervalId)
    }
  }, [fetchUserTransactions])

  useEffect(() => {
    if (isModalOpen && modalStep === 0 && isConnected) {
      setIsModalOpen(false)
      setModalStep(1)
    } else if (!showModalDetailedTx && showModalOngoingTx && (unwrapSuccess || ongoingBridgeTx.type === 'wrap')) {
      setModalStep(2)
      setIsModalOpen(true)
    } else if (showModalDetailedTx && isModalOpen) {
      setIsModalOpen(false)
    }
  }, [isConnected, isModalOpen, modalStep, ongoingBridgeTx, showModalDetailedTx, showModalOngoingTx, unwrapSuccess])

  useEffect(() => {
    if (isWrapping) {
      onNetworkChange()
      return
    }
    const interval = setInterval(async () => setRemainingDailyLimit(await fetchDailyLimit()), REFETCH_LIMIT_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchDailyLimit, isWrapping])

  // The Ootle account loads after the first fetch; fetch again to include its transactions.
  const ootleAddress = ootleAccount?.address
  useEffect(() => {
    if (ootleAddress) onOotleAccountReady()
  }, [ootleAddress])

  // Finish an Ootle wrap whose deposit was sent before the last reload.
  useEffect(() => {
    if (!ootleWrapToResume || !ootleAccount) return
    clearOotleWrapToResume()
    finishOotleWrap(ootleWrapToResume).catch((error) =>
      console.error('[ TAPPLET-BRIDGE ] Failed to resume the Ootle wrap:', errorSummary(error)),
    )
  }, [finishOotleWrap, ootleAccount, ootleWrapToResume])

  const handleSetOngoingModalOpen = (open: boolean) => {
    setIsModalOpen(open)
    if (ongoingBridgeTx) setLastOngoingBridgeTx({ ...ongoingBridgeTx, showModal: false })
  }
  const handleCloseModal = () => {
    resetField('amount', { defaultValue: '' })
    setUnwrapFailed(false)
    setBridgeError('')
    handleSetOngoingModalOpen(false)
    setModalStep(1)
  }

  return (
    <main className="relative min-h-screen w-full flex flex-col pl-(--tu-padding-left) pr-8 items-center justify-center">
      <Header />
      <FormProvider {...methods}>
        <MainComponent remainingDailyLimit={remainingDailyLimit} />
        {isModalOpen && !showModalDetailedTx && (
          <MainModal
            success={isWrapSuccess}
            failed={isFailed}
            step={modalStep}
            amount={amount}
            ethereumAddress={ethAddress}
            tariWalletAddress={tariSideAddress}
            feesData={feesData}
            closeModalAction={handleCloseModal}
            type={ongoingBridgeTx?.type || 'wrap'}
          />
        )}
      </FormProvider>
      {detailedTx && <TransactionDetailsModal transaction={detailedTx} closeModalAction={() => setDetailedTx(null)} />}
      <FooterText />
    </main>
  )
}
