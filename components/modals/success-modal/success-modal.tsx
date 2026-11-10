import Image from 'next/image'
import React, { useCallback, useState } from 'react'

import { ModalButton } from '@/components/modals/modal-button'
import { useBridgeInfo } from '@/hooks/use-bridge-info'
import { useWalletUtils } from '@/hooks/use-wallet'
import { useTariAccountStore, removeOngoingTransaction } from '@/store/account'
import useTariSigner from '@/store/signer'
import { CopyIcon } from '@/styles/copyIcon'
import { getTransactionAmount } from '@/utils/transaction'
import { truncateAddress } from '@/utils/truncate'
import { sendErrorMessage } from '@/utils/universe'
import { utils } from 'ethers'
import { useTranslation } from 'react-i18next'
import {
  CopyIconWrapper,
  CopyText,
  HelperText,
  OfficialContractAddressConainer,
  OfficialContractAddressWrapper,
} from './success-modal.styles'
import { SuccessModalProps } from './success-modal.types'
import { useBridgeRoute } from '@/hooks/use-bridge-route'
import { getUnlistedOotleLabels } from '@/utils/bridge-route'
import { removeStoredWrap } from '@/hooks/use-bridge-ootle-to-evm'

export const SuccessModal = ({
  closeModalAction,
  amount: _amountProp,
  tariWalletAddress,
  ethereumAddress,
  detailedTx,
  type,
  asset: assetProp,
  ootleChainId,
}: SuccessModalProps) => {
  const { t } = useTranslation('main', { useSuspense: false })
  const signer = useTariSigner((s) => s.signer)
  const ongoingBridgeTx = useTariAccountStore((s) => s.ongoingBridgeTx)
  const { route } = useBridgeRoute()
  // undefined for an Ootle tx whose chain the params no longer offer
  const asset = assetProp ?? (ootleChainId === undefined ? route.asset : undefined)
  const unlisted = ootleChainId !== undefined && !asset ? getUnlistedOotleLabels(ootleChainId) : undefined

  const { fromToken, toToken } = useBridgeInfo(
    { asset: asset ?? unlisted!, isWrapping: type === 'wrap' },
    ethereumAddress!,
    tariWalletAddress!,
  )
  const { addTokenToWalletAction } = useWalletUtils()
  const [copied, setCopied] = useState(false)

  const handleCopyAddress = useCallback(async () => {
    if (!asset) return
    await navigator.clipboard.writeText(asset.tokenAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [asset])

  const handleAddWxtmToWalletAction = useCallback(() => {
    if (!asset) return
    console.info('[ TAPPLET-BRIDGE ] Adding WXTM token to the wallet initiated')
    // wTARI lives on the route's chain, so ask the wallet to switch there first.
    addTokenToWalletAction(asset, asset.kind === 'ootle')
      .then(() => {
        console.info('[ TAPPLET-BRIDGE ] Adding WXTM token to the wallet successful')
      })
      .catch((error) => {
        sendErrorMessage(`Request failed. Feature not supported by your wallet app.`)
        console.error('[ TAPPLET-BRIDGE ] Fail to add WXTM token to the wallet: ', error)
      })
  }, [addTokenToWalletAction, asset])
  const handleOnClick = useCallback(async () => {
    closeModalAction()
    // A history entry is not the current bridge: its close must not clear the current one's state or TU record.
    if (detailedTx) return
    const paymentId = useTariAccountStore.getState().ongoingBridgeTx?.paymentId
    removeOngoingTransaction()
    // TU's record may by now belong to a newer bridge; remove it only if it is still this one's.
    await removeStoredWrap(signer, paymentId)
  }, [closeModalAction, detailedTx, signer])

  const transaction = detailedTx || ongoingBridgeTx
  const { amount: txAmount, decimals } = transaction ? getTransactionAmount(transaction) : { amount: '0', decimals: 6 }
  const amount = parseFloat(utils.formatUnits(txAmount, decimals)).toPrecision()

  const txAmountToReceive = transaction?.amountAfterFee ?? '0'
  const amountToReceive = parseFloat(utils.formatUnits(txAmountToReceive, decimals)).toPrecision()

  const destAddressRaw = detailedTx ? detailedTx.destinationAddress : (ongoingBridgeTx?.destinationAddress ?? '')

  const destAddress = type === 'unwrap' ? truncateAddress(destAddressRaw || '', 15) : destAddressRaw
  return (
    <div className="w-full flex flex-col p-6">
      <div className="mt-2">
        {/* Top Section */}
        <div className="flex flex-col items-center justify-center">
          <div className="w-[49px] h-[49px] rounded-full overflow-hidden mr-1 relative">
            <Image src="/icons/tick.png" fill sizes="49px" alt="Tick" className="rounded-full object-cover" />
          </div>
          <div className="font-semibold text-lg mt-2">
            {t(type === 'unwrap' ? 'success_unwrapped' : 'success_wrapped', {
              amount,
              fromToken,
            })}
          </div>
          <div className="font-normal text-xs mt-2 text-center px-3">{t('conversion_complete', { toToken })}</div>
        </div>
        <div style={{ height: 20 }} />
        {unlisted && (
          <div className="text-xs text-gray-500 text-center">
            {unlisted.evmToken} · {unlisted.chainName}
          </div>
        )}
        {asset && (
          <>
            <OfficialContractAddressConainer>
              <OfficialContractAddressWrapper>
                <span className="label">
                  {asset.kind === 'ootle'
                    ? t('official_token_address', { token: asset.evmToken })
                    : t('official_wxtm_token_address')}
                </span>
                <span className="address">{asset.tokenAddress}</span>
              </OfficialContractAddressWrapper>
              <CopyIconWrapper onClick={handleCopyAddress}>
                <CopyIcon size={16} />
                {copied && (
                  <CopyText
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                  >
                    {t('copied')}
                  </CopyText>
                )}
              </CopyIconWrapper>
            </OfficialContractAddressConainer>
            <div style={{ height: 10 }} />
            <HelperText>
              <div className="strong">{t('how_to_view_wxtm_in_wallet', { evmToken: asset.evmToken })}</div>
              <div>
                {t('how_to_view_wxtm_step1_prefix', { evmToken: asset.evmToken })}
                <span className="strong">{t('token_address')}</span>
                {t('how_to_view_wxtm_step1_middle')}
                <span className="strong">{asset.kind === 'ootle' ? asset.chainName : t('ethereum_mainnet')}</span>
                {t('how_to_view_wxtm_step1_network')}
                <span className="btn" onClick={handleAddWxtmToWalletAction}>
                  {t('click_here')}
                </span>
                {t('how_to_view_wxtm_step2')}
              </div>
            </HelperText>
          </>
        )}
        {/* Section 1 */}
        <div className="flex flex-col my-4">
          <div className="font-medium">
            <div className="text-xs text-gray-500">{t('amount_to_receive')}</div>
            <div className="text-sm">
              {amountToReceive} {toToken}
            </div>
          </div>

          <div className="py-[0.5px] w-full bg-gray-300 my-2"></div>

          <div className="font-medium">
            <div className="text-xs text-gray-500">{t('destination_address')}</div>
            <div className="text-sm">{destAddress}</div>
          </div>
          <div className="py-[0.5px] w-full bg-gray-300 my-2"></div>
          <ModalButton label="Close" onClick={handleOnClick} disabled={false} />
        </div>
      </div>
    </div>
  )
}
