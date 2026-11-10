import React, { useCallback, useState } from 'react'
import Image from 'next/image'
import { IoCloseOutline } from 'react-icons/io5'

import { ReviewModalProps } from './review-modal.types'
import { ModalButton } from '@/components/modals/modal-button'
import { useBridgeInfo } from '@/hooks/use-bridge-info'
import { truncateAddress } from '@/utils/truncate'
import { useTranslation } from 'react-i18next'
import { useConnection } from 'wagmi'
import { useBridgeRoute } from '@/hooks/use-bridge-route'

export const ReviewModal = ({
  closeModalAction,
  amount,
  tariWalletAddress,
  feesData,
  handleBridgeToEthereum,
  handleBridgeToTari,
}: ReviewModalProps) => {
  const { t } = useTranslation('main', { useSuspense: false })
  const { address: ethAddress } = useConnection()
  const { amountAfterFee, feeAmount, feePercentage, isOverHighBridgeThreshold } = feesData
  const { from: fromNetwork, to: toNetwork, route } = useBridgeRoute()

  const { fromToken, toToken, destAddress, bridgeHandler } = useBridgeInfo(
    route,
    ethAddress!,
    tariWalletAddress!,
    handleBridgeToEthereum,
    handleBridgeToTari,
  )
  const [clicked, setClicked] = useState(false)

  const handleClick = useCallback(() => {
    if (clicked || !bridgeHandler) return
    setClicked(true)
    bridgeHandler()
  }, [bridgeHandler, clicked])

  return (
    <div className="w-full flex flex-col p-6">
      <div className="mt-2">
        {/* Top Section */}
        <div className="flex justify-between items-center">
          <div className="font-semibold text-lg">Review transaction</div>

          <button
            className="text-black font-bold hover:cursor-pointer
                 cursor-pointer flex text-xl rounded-full p-1 bg-black/10 hover:bg-black/20"
            onClick={closeModalAction}
          >
            <IoCloseOutline />
          </button>
        </div>

        {/* Section 1 */}
        <div className="flex justify-between gap-2 mt-4 items-center p-4 rounded-2xl bg-white border-[1px] border-gray-200 max-w-[421px]">
          <div className="space-y-[-10px]">
            <div className="font-medium text-sm">Amount to bridge</div>
          </div>

          <div>
            <div className="flex items-center rounded-3xl justify-center">
              <div className="w-[25.63px] h-[25.63px] rounded-full overflow-hidden mr-1 relative">
                <Image
                  src={fromNetwork.icon}
                  fill
                  sizes="25.63px"
                  alt="Tari icon"
                  className="rounded-full object-cover"
                />
              </div>
              <div className="flex items-center font-semibold text-3xl">
                {parseFloat(amount).toPrecision()}
                <div className="text-gray-500 text-xs font-medium ml-1">{fromToken}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Optional modal if amount > 100,000 XTM */}
        {isOverHighBridgeThreshold && (
          <div
            className="flex justify-between gap-2 mt-4 items-center p-4 rounded-2xl bg-white border-[1px] border-gray-200 max-w-[421px]"
            style={{
              backgroundColor: '#FF770033',
              border: '1px solid #0000001A',
            }}
          >
            <div className="space-y-[-10px]">
              <div className="font-medium text-sm" style={{ color: '#B35400' }}>
                Bridging over{' '}
                <span className="font-bold">
                  {route.asset.highThreshold} {route.asset.tariToken}
                </span>{' '}
                may take up to 24-48h to complete due to extra verification.
              </div>
            </div>
          </div>
        )}

        {/* Section 2 */}
        <div className="flex flex-col my-4">
          <div className="font-medium">
            <div className="text-xs text-gray-500">
              {'Source wallet'} <span>({fromNetwork.name})</span>
            </div>

            <div className="text-sm">
              {destAddress === ethAddress ? truncateAddress(tariWalletAddress!, 15) : ethAddress}
            </div>
          </div>

          <div className="py-[0.5px] w-full bg-gray-300 my-2"></div>

          <div className="font-medium">
            <div className="text-xs text-gray-500">
              {'Destination address'} <span>({toNetwork.name})</span>
            </div>

            <div className="text-sm">
              {destAddress === tariWalletAddress ? truncateAddress(tariWalletAddress!, 15) : ethAddress}
            </div>
          </div>

          <div className="py-[0.5px] w-full bg-gray-300 my-2"></div>

          <div className="font-medium">
            <div className="text-xs text-gray-500">You will receive</div>

            <div className="text-sm">
              {parseFloat(amountAfterFee).toPrecision()} {toToken}
            </div>
          </div>

          <div className="py-[0.5px] w-full bg-gray-300 my-2"></div>

          <div className="flex justify-between">
            <div className="flex flex-col font-medium">
              <div className="text-xs text-gray-500">Network fee</div>

              <div className="text-sm">
                {parseFloat(feeAmount).toPrecision()} {fromToken}
              </div>
            </div>

            <div className="text-gray-500 text-[10px] text-right self-end">Fees {feePercentage.toPrecision()}%</div>
          </div>

          <div className="py-[0.5px] w-full bg-gray-300 my-2"></div>

          <div className="font-medium">
            <div className="text-xs text-gray-500">Estimated time</div>
            <div className="text-sm">24h</div>
          </div>

          {/* <div className="py-[0.5px] w-full bg-gray-300 my-2"></div>

          <div className="font-medium">
            <div className="text-xs text-gray-500">Transaction ID</div>
            <div className="text-sm">GH7SLK9087</div>
          </div> */}
        </div>

        <ModalButton label={t('confirm_and_bridge')} onClick={handleClick} disabled={clicked} />
      </div>
    </div>
  )
}
