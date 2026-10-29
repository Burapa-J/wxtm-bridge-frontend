import React, { useCallback } from 'react'
import Image from 'next/image'
import { FailedModalProps } from './failed-modal.types'
import { ModalButton } from '@/components/modals/modal-button'

import useTariSigner from '@/store/signer'
import { useTranslation } from 'react-i18next'
import { useBridgeStore } from '@/store/bridge'
import { clearOotleWrapToResume, removeOngoingTransaction, useTariAccountStore } from '@/store/account'
import { useBridgeRoute } from '@/hooks/use-bridge-route'
import { getTransactionLabels } from '@/utils/bridge-route'

export const FailedModal = ({ closeModalAction, paymentId: paymentIdProp, asset, ootleChainId }: FailedModalProps) => {
  const signer = useTariSigner((s) => s.signer)
  const bridgeError = useBridgeStore((s) => s.bridgeError)
  const ootleWrapUnconfirmed = useBridgeStore((s) => s.ootleWrapUnconfirmed)
  const { route } = useBridgeRoute()
  const { isWrapping } = route
  const labels = getTransactionLabels(asset, ootleChainId, route.asset)
  const ongoingBridgeTx = useTariAccountStore((s) => s.ongoingBridgeTx)
  const { t } = useTranslation('main', { useSuspense: false })

  const handleOnClick = useCallback(async () => {
    closeModalAction()
    removeOngoingTransaction()
    // With a bridgeError, any tx stored in TU is an Ootle deposit still to confirm on the next load.
    if (!bridgeError) await signer?.removeOngoingBridgeTx()
  }, [bridgeError, closeModalAction, signer])

  // Stop waiting for an unconfirmed Ootle deposit; the backend still credits it by its payRef.
  const handleDismissOotleWrap = useCallback(async () => {
    closeModalAction()
    removeOngoingTransaction()
    clearOotleWrapToResume()
    try {
      const stored = await signer?.getOngoingBridgeTx()
      if (stored?.network === 'Ootle') await signer?.removeOngoingBridgeTx()
    } catch (error) {
      console.error('[ TAPPLET-BRIDGE ] Could not dismiss the Ootle wrap: ', error)
    }
  }, [closeModalAction, signer])

  return (
    <div className="w-full flex flex-col p-6">
      <div className="mt-2">
        {/* Top Section */}
        <div className="flex flex-col items-center justify-center">
          <div className="w-[49px] h-[49px] rounded-full overflow-hidden mr-1 relative">
            <Image src="/icons/timeout.png" fill sizes="49px" alt="Timeout" className="rounded-full object-cover" />
          </div>
          <div className="font-semibold text-lg mt-2">{t('something_went_wrong')}</div>
          <div className="font-normal text-xs mt-2 text-center px-3">
            {bridgeError ||
              (isWrapping
                ? t('wrap_failed_message', { tariToken: labels.tariToken })
                : t('unwrap_failed_message', { evmToken: labels.evmToken, chain: labels.chainName }))}
          </div>
        </div>

        {/* Section 1 */}
        <div className="flex flex-col my-4">
          {isWrapping && (paymentIdProp || ongoingBridgeTx?.paymentId) ? (
            <div className="font-medium">
              <div className="text-xs text-gray-500">{t('transaction_id')}</div>
              <div className="text-sm">{paymentIdProp || ongoingBridgeTx?.paymentId}</div>
            </div>
          ) : (
            <div></div>
          )}

          <div className="py-[0.5px] w-full bg-gray-300 my-2"></div>
          <ModalButton label={t('close')} onClick={handleOnClick} disabled={false} />
          {ootleWrapUnconfirmed && (
            <div className="mt-2">
              <ModalButton label={t('ootle_wrap_dismiss')} onClick={handleDismissOotleWrap} disabled={false} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
