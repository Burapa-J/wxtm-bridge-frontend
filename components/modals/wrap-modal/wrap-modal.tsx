import { config } from '@/config'
import { useBridgeInfo } from '@/hooks/use-bridge-info'

import { getTransactionAmount, getWrapModalTitle } from '@/utils/transaction'
import { truncateAddress } from '@/utils/truncate'
import { openExternalLink } from '@/utils/universe'
import { utils } from 'ethers'
import Image from 'next/image'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { IoCloseOutline } from 'react-icons/io5'
import { ModalButton } from '../modal-button'
import { WrapModalProps } from './wrap-modal.types'
import { useTariAccountStore } from '@/store/account'
import { useBridgeRoute } from '@/hooks/use-bridge-route'
import { getUnlistedOotleLabels } from '@/utils/bridge-route'

/** @TODO Refactor and get rid of conditional display here create unwrap-modal and use it for unwrap txs */
export const WrapModal = ({
  tariWalletAddress,
  ethereumAddress,
  feesData,
  closeModalAction,
  amountAfterFee: amountAfterFeeProp,
  destinationAddress: destAddressProp,
  transactionStatus,
  type,
  asset,
  ootleChainId,
}: WrapModalProps) => {
  const { i18n, t } = useTranslation('main', { useSuspense: false })
  const ongoingBridgeTx = useTariAccountStore((s) => s.ongoingBridgeTx)
  const { route } = useBridgeRoute()

  const bridgeInfo = useBridgeInfo(
    {
      asset: asset ?? (ootleChainId !== undefined ? getUnlistedOotleLabels(ootleChainId) : route.asset),
      isWrapping: type === 'wrap',
    },
    ethereumAddress!,
    tariWalletAddress!,
  )
  const amountAfterFeePending = amountAfterFeeProp
    ? parseFloat(utils.formatUnits(amountAfterFeeProp, type === 'wrap' ? 6 : 18)).toPrecision()
    : ongoingBridgeTx?.amountAfterFee
      ? parseFloat(
          utils.formatUnits(ongoingBridgeTx.amountAfterFee, getTransactionAmount(ongoingBridgeTx).decimals),
        ).toPrecision()
      : feesData.amountAfterFee

  const destAddressRaw = destAddressProp || ongoingBridgeTx?.destinationAddress || bridgeInfo.destAddress
  const destAddressPending = type === 'unwrap' ? truncateAddress(destAddressRaw || '', 15) : destAddressRaw

  // Pass the current language to getModalTitle
  const { title, subtext } = getWrapModalTitle(
    bridgeInfo,
    feesData,
    transactionStatus || ongoingBridgeTx,
    i18n.language,
    type,
  )

  return (
    <div className="w-full flex flex-col p-6">
      <div className="mt-2">
        {/* Top Section */}
        <div className="w-full flex justify-end">
          <button
            className="text-black font-bold hover:cursor-pointer
                     cursor-pointer flex text-xl rounded-full p-1 bg-black/10 hover:bg-black/20"
            onClick={closeModalAction}
          >
            <IoCloseOutline />
          </button>
        </div>
        <div className="flex flex-col items-center justify-center">
          <div className="w-[63px] h-[63px] rounded-full overflow-hidden mr-1 relative">
            <Image
              src="/icons/clock.png"
              fill
              sizes="63px"
              alt={t('clock_icon_alt')}
              className="rounded-full object-cover"
            />
          </div>
          <div className="font-semibold text-lg mt-2">{title}</div>
          <div className="font-normal text-xs mt-2 text-center px-5">{subtext}</div>
        </div>

        {/* Section 1 */}
        <div className="flex flex-col my-4">
          <div className="font-medium">
            <div className="text-xs text-gray-500">{t('amount_to_receive')}</div>
            <div className="text-sm">
              {amountAfterFeePending} {bridgeInfo.toToken}
            </div>
          </div>

          <div className="py-[0.5px] w-full bg-gray-300 my-2"></div>

          <div className="font-medium">
            <div className="text-xs text-gray-500">{t('destination_address')}</div>
            <div className="text-sm">{destAddressPending}</div>
          </div>

          <div className="py-[0.5px] w-full bg-gray-300 my-2"></div>

          <ModalButton label={t('close')} onClick={closeModalAction} disabled={false} />
          <div className="mt-8 text-center text-xs text-gray-500">
            {t('having_trouble')}{' '}
            <a
              onClick={(e) => openExternalLink(config.TARI_BRIDGE_FAQ_URL, e)}
              rel="noopener noreferrer"
              className="underline cursor-pointer"
            >
              {t('view_faqs')}
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
