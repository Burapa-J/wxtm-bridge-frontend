'use client'

import React, { useCallback, useEffect, useRef } from 'react'
import { useConnection } from 'wagmi'

import ConnectionModal from '@/components/modals/connection-modal/connection-modal'
import { InfoModal } from '@/components/modals/info-modal'
import { ReviewModal } from '@/components/modals/review-modal'
import { SuccessModal } from '@/components/modals/success-modal'
import { WrapModal } from '@/components/modals/wrap-modal'
import { FailedModal } from '../failed-modal'
import { MainModalProps } from './main-modal.types'

import { setExceededDailyLimit, setUnwrapFailed, setUnwrapSuccess } from '@/store/bridge'
import { useBridgeTransaction } from '@/hooks/use-bridge-transaction'
import { useBridgeToEthereum } from '@/hooks/use-bridge-to-ethereum'
import { useBridgeOotleToEvm } from '@/hooks/use-bridge-ootle-to-evm'
import { useBridgeToTari } from '@/hooks/use-bridge-to-tari'
import { useBridgeRoute } from '@/hooks/use-bridge-route'
import { useTariAccountStore } from '@/store/account'
import { getTransactionAsset } from '@/utils/bridge-route'
import { setIsModalOpen, setModalStep } from '@/store/modal'
import { errorSummary } from '@/utils/error-summary'

const DAILY_LIMIT_ERROR = 'Daily wrap limit exceeded'
const DAILY_LIMIT_ERROR_TYPE = 'Forbidden'

export const MainModal = ({
  success,
  failed,
  step,
  amount,
  tariWalletAddress,
  ethereumAddress,
  feesData,
  closeModalAction,
  type,
}: MainModalProps) => {
  const modalRef = useRef<HTMLDivElement>(null)
  const { address: ethAddress, isConnected } = useConnection()
  const { route, assets } = useBridgeRoute()
  const { asset } = route
  const ongoingBridgeTx = useTariAccountStore((s) => s.ongoingBridgeTx)
  const ongoingAsset = ongoingBridgeTx ? getTransactionAsset(ongoingBridgeTx.ootleChainId, assets) : undefined

  const { getUserBackendBridgeTxs } = useBridgeTransaction()
  const { bridgeToEthereum } = useBridgeToEthereum()
  const { bridgeOotleToEvm } = useBridgeOotleToEvm()

  const { bridgeToTari, isSuccess, isError, error, isPending } = useBridgeToTari(ethAddress || '0x', asset)

  const handleBridgeToEthereum = useCallback(() => {
    if (!amount || !ethAddress) {
      return
    }

    const bridge =
      asset.kind === 'ootle'
        ? bridgeOotleToEvm({ amount, evmAddress: ethAddress, amountAfterFee: feesData.amountAfterFee, asset })
        : bridgeToEthereum({
            amount,
            ethAddress: ethAddress,
            amountAfterFee: feesData.amountAfterFee,
          })

    bridge
      .then(async () => {
        await getUserBackendBridgeTxs()
        setExceededDailyLimit(false)
      })
      .catch((e) => {
        const error = e as Error
        const isLimitError =
          error?.message?.includes(DAILY_LIMIT_ERROR) || error?.message?.includes(DAILY_LIMIT_ERROR_TYPE)
        if (isLimitError) {
          console.warn('[ TAPPLET-BRIDGE ] Bridge operation failed:', errorSummary(e))
          setExceededDailyLimit(true)
          setIsModalOpen(false)
        } else {
          console.error('[ TAPPLET-BRIDGE ] Bridge operation failed:', errorSummary(e))
        }
      })
  }, [amount, asset, bridgeOotleToEvm, bridgeToEthereum, ethAddress, feesData.amountAfterFee, getUserBackendBridgeTxs])

  const handleBridgeToTari = async () => {
    if (!amount || !ethAddress || !tariWalletAddress) {
      return
    }
    console.debug(`[ TAPPLET-BRIDGE ] Initiating transaction...`)
    setModalStep(3)
    const success = await bridgeToTari(amount, ethAddress, tariWalletAddress)
    if (success) {
      setUnwrapFailed(false)
    } else {
      setUnwrapFailed(true)
    }
  }

  useEffect(() => {
    if (isSuccess) {
      console.debug(`[ TAPPLET-BRIDGE ] Unwrap transaction success!`)
      setModalStep(2)
      setUnwrapSuccess(true)
    } else if (isError) {
      console.error(`[ TAPPLET-BRIDGE ] Unwrap transaction failed:`, error)
      setUnwrapFailed(true)
    }
  }, [isPending, isSuccess, isError, error])

  if (step === 0 && isConnected) return null

  const renderModal = () => {
    if (success)
      return (
        <SuccessModal
          closeModalAction={closeModalAction}
          amount={amount}
          tariWalletAddress={tariWalletAddress}
          ethereumAddress={ethereumAddress}
          type={type}
          asset={ongoingAsset}
          ootleChainId={ongoingBridgeTx?.ootleChainId}
        />
      )

    if (failed) return <FailedModal closeModalAction={closeModalAction} paymentId={undefined} />

    if (!isConnected && step === 0) return <ConnectionModal closeModalAction={closeModalAction} />
    if (step === 1)
      return (
        <ReviewModal
          amount={amount}
          closeModalAction={closeModalAction}
          ethereumAddress={ethereumAddress}
          tariWalletAddress={tariWalletAddress}
          handleBridgeToEthereum={handleBridgeToEthereum}
          handleBridgeToTari={handleBridgeToTari}
          feesData={feesData}
        />
      )
    if (step === 2)
      return (
        <WrapModal
          closeModalAction={closeModalAction}
          tariWalletAddress={tariWalletAddress}
          ethereumAddress={ethereumAddress}
          feesData={feesData}
          type={type}
          asset={ongoingAsset}
          ootleChainId={ongoingBridgeTx?.ootleChainId}
        />
      )
    if (step === 3) return <InfoModal />
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <section
        ref={modalRef}
        className="w-full max-w-md mx-4 bg-[#E0DFDE] shadow-[0px_4px_74px_0px_rgba(0,0,0,0.15)] backdrop-blur-[54px] rounded-3xl overflow-hidden flex flex-col justify-center items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {renderModal()}
      </section>
    </div>
  )
}
