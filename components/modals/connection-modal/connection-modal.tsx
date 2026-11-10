'use client'
import Image from 'next/image'
import { useTranslation } from 'react-i18next'
import { Connector, useConnect, useConnectors } from 'wagmi'
import { IoCloseOutline } from 'react-icons/io5'
import { ConnectionModalProps } from './connection-modal.types'
import { useBridgeRoute } from '@/hooks/use-bridge-route'

const ConnectionModal = ({ closeModalAction }: ConnectionModalProps) => {
  const connectors = useConnectors()
  const { mutateAsync: connect, status } = useConnect()
  const { t } = useTranslation('main', { useSuspense: false })
  const { route } = useBridgeRoute()

  const loader = status === 'pending' && (
    <div className="flex space-x-1 animate-pulse">
      <div className="w-2 h-2 bg-gray-400 rounded-full delay-100"></div>
      <div className="w-2 h-2 bg-gray-400 rounded-full delay-150"></div>
      <div className="w-2 h-2 bg-gray-400 rounded-full delay-250"></div>
    </div>
  )

  async function onConnectClick(connector: Connector) {
    try {
      connect({ connector })
    } catch (e) {
      console.error('WC Connect Error: ', e)
    }
  }

  const connectorMarkup = connectors?.length ? (
    <div className="py-4">
      <div className="rounded-3xl bg-[#F8F8F9]/80 flex flex-col justify-center overflow-hidden">
        {connectors.slice(0, 1)?.map((connector) => {
          return (
            <div key={connector.uid} className="w-full">
              <button
                onClick={() => onConnectClick(connector)}
                className="hover:bg-gray-200/40 hover:cursor-pointer p-4 font-bold w-full text-left flex gap-2 items-center justify-between px-6"
              >
                <div className="flex items-center gap-2">
                  {connector.name === 'WalletConnect' && (
                    <div className="w-[42px] h-[42px] rounded-xl overflow-hidden relative">
                      <Image
                        src="/icons/walletconnect.png"
                        fill
                        sizes="42px"
                        alt={t('wallet_icon_alt')}
                        className="object-cover"
                      />
                    </div>
                  )}
                  {t(`connector_${connector.name.toLowerCase()}`, {
                    defaultValue: connector.name,
                  })}
                </div>
                {loader}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  ) : null

  return (
    <div className="w-full flex flex-col relative">
      <button
        className="text-black font-bold hover:cursor-pointer absolute top-4 right-4 cursor-pointer flex text-xl rounded-full p-1 bg-black/10 hover:bg-black/20"
        onClick={closeModalAction}
        aria-label={t('close')}
      >
        <IoCloseOutline />
      </button>
      <div className="mt-10 px-4">
        <div className="ml-1 flex flex-col">
          <h2 className="text-lg font-bold">{t('connect_wallet_title')}</h2>
          <span className="text-sm font-bold text-gray-500 mt-1">
            {t('connect_wallet_subtitle', { evmToken: route.asset.evmToken })}
          </span>
          {connectorMarkup}
        </div>
      </div>
    </div>
  )
}

export default ConnectionModal
