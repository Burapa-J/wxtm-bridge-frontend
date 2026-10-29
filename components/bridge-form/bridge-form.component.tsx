'use client'

import React, { useState } from 'react'
import Image from 'next/image'
import { erc20Abi } from 'viem'
import { useConnection, useReadContract } from 'wagmi'
import { FaArrowRight } from 'react-icons/fa6'
import { Network, NetworkBox } from '@/components/network-box'
import { MainButton } from '@/components/main-button'
import { BridgeInput } from '@/components/bridge-input'
import { useBridgeInfo } from '@/hooks/use-bridge-info'
import { useBridgeRoute } from '@/hooks/use-bridge-route'
import { hasRouteFrom, hasRouteTo, pickNetwork } from '@/utils/bridge-route'
import { parseToMaxAllowed } from '@/utils/parse-wxtm-token-amount'
import { formatNumber, FormatPreset } from '@/utils/formatters'
import { useTranslation } from 'react-i18next'
import { MainComponentProps } from '../main'
import { setIsModalOpen, setModalStep } from '@/store/modal'
import { useFormContext } from 'react-hook-form'
import { setBridgeError, setNetworks, useBridgeStore } from '@/store/bridge'
import { useTariAccountStore } from '@/store/account'
import useTariSigner from '@/store/signer'
import { useBridgeOotleToEvm } from '@/hooks/use-bridge-ootle-to-evm'
import { errorSummary } from '@/utils/error-summary'

export const BridgeForm = ({ remainingDailyLimit }: MainComponentProps) => {
  const { t } = useTranslation('main', { useSuspense: false })
  const signer = useTariSigner((s) => s.signer)
  const { finishOotleWrap } = useBridgeOotleToEvm()
  const { assets, networks, from: fromNetwork, to: toNetwork, route } = useBridgeRoute()
  const { asset, isWrapping } = route
  // No new bridge while an Ootle deposit awaits confirmation; it would take over the ongoing tx.
  const ootleWrapInFlight = useBridgeStore((s) => s.ootleWrapInFlight)
  const {
    setValue,
    formState: { isValid },
  } = useFormContext()

  const [openDropdown, setOpenDropdown] = useState<'from' | 'to' | null>(null)

  const { isConnected, chain, address } = useConnection()
  const { fromToken } = useBridgeInfo(route)
  const tariBalance = useTariAccountStore((s) => s.availableBalance)
  const ootleBalance = useTariAccountStore((s) => s.ootleAvailableBalance)
  // micro units on the Tari side
  const availableBalance = asset.tariNetwork === 'Ootle' ? ootleBalance : tariBalance

  const { data: balanceRes } = useReadContract({
    abi: erc20Abi,
    address: asset.tokenAddress,
    functionName: 'balanceOf',
    args: [address || ('' as `0x${string}`)],
    account: address,
    chainId: asset.chainId,
  })

  const handleConnectClick = () => {
    if (!isConnected) {
      // a new flow starts; drop any error left from an earlier one
      setBridgeError('')
      setModalStep(0)
      setIsModalOpen(true)
    }
  }

  const handleContinueClick = async () => {
    setBridgeError('')
    // Universe keeps one ongoing tx; a new bridge would overwrite an Ootle wrap's clientToken there.
    let unfinished = useTariAccountStore.getState().ootleWrapToResume
    if (!unfinished && signer) {
      try {
        unfinished = await signer.getOngoingBridgeTx()
      } catch (error) {
        console.error('[ TAPPLET-BRIDGE ] Could not read the ongoing bridge tx: ', error)
      }
    }
    if (unfinished?.network === 'Ootle' && unfinished.clientToken) {
      setBridgeError(t('ootle_wrap_unfinished'))
      setModalStep(1)
      setIsModalOpen(true)
      // retry it now; Continue stays disabled while it runs
      finishOotleWrap(unfinished).catch((error) =>
        console.error('[ TAPPLET-BRIDGE ] Retrying the Ootle wrap failed: ', errorSummary(error)),
      )
      return
    }
    setModalStep(1)
    setIsModalOpen(true)
  }
  const evm_balance = balanceRes ? formatNumber(Number(balanceRes), FormatPreset.WXTM_LONG) : '0'
  const isDisabled = chain === undefined

  const fromNetworks = networks.filter((n) => hasRouteFrom(n, networks, assets))
  const toNetworks = networks.filter((n) => hasRouteTo(n, networks, assets))

  const handleNetworkSelect = (network: Network, type: 'from' | 'to') => {
    const picked = pickNetwork(type, network, fromNetwork, toNetwork, networks, assets)
    if (picked) {
      setNetworks(picked.from, picked.to)
    }
    setOpenDropdown(null)
  }

  const handleMaxAmount = () => {
    const balance = getBalance()
    const parsedRounded = parseToMaxAllowed(balance)
    if (balance && parsedRounded > 0) {
      setValue('amount', parsedRounded.toString(), {
        shouldValidate: true,
        shouldDirty: true,
        shouldTouch: true,
      })
    }
  }

  const getBalance = (formatted = false) => {
    return isWrapping
      ? formatted
        ? formatNumber(availableBalance || 0, FormatPreset.XTM_COMPACT)
        : (availableBalance / 1_000_000).toString()
      : evm_balance
  }

  const inputAvailableBalance = () =>
    isWrapping ? availableBalance / 1000000 : (Number(balanceRes) ?? 0) / Math.pow(10, 18)

  return (
    <div className="bg-white/50 backdrop-blur-sm shadow-xl rounded-2xl p-4 mx-auto min-h-[130px] fixed-box mb-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="w-full flex flex-col p-1">
          <div className="relative">
            <div className="flex items-center justify-center">
              <div className="relative flex gap-[2px] w-full items-stretch">
                {/* Wrap Box 1 and Box 2 in a relative container for precise arrow positioning */}
                <div className="relative flex flex-[2] gap-[2px]">
                  {/* Box 1 - From */}
                  <div className="flex-1">
                    <NetworkBox
                      type="from"
                      selected={fromNetwork}
                      isOpen={openDropdown === 'from'}
                      networks={fromNetworks}
                      onToggle={() => setOpenDropdown(openDropdown === 'from' ? null : 'from')}
                      onSelect={(network) => handleNetworkSelect(network, 'from')}
                    />
                  </div>

                  {/* Box 2 - To */}
                  <div className="flex-1">
                    <NetworkBox
                      type="to"
                      selected={toNetwork}
                      isOpen={openDropdown === 'to'}
                      networks={toNetworks}
                      onToggle={() => setOpenDropdown(openDropdown === 'to' ? null : 'to')}
                      onSelect={(network) => handleNetworkSelect(network, 'to')}
                      fromNetwork={fromNetwork}
                    />
                  </div>

                  {/* Arrow — Between Box 1 and Box 2 */}
                  <div className="this-hide absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                    <div className="w-8 h-8 rounded-md border-2 border-gray-300 bg-white flex items-center justify-center shadow-sm">
                      <FaArrowRight className="text-[15px] text-[#171717]" />
                    </div>
                  </div>
                </div>

                {/* Box 3 - Amount */}
                <div className="flex-1">
                  <div className="flex justify-between items-center p-2 px-2 2xl:px-4 rounded-xl bg-white border border-gray-200 min-h-[90px] max-h-[90px]">
                    <div className="space-y-[-8px] mr-[-10px]">
                      <div className="font-medium text-xs text-gray-500">{t('amount_to_bridge')}</div>
                      <BridgeInput
                        route={route}
                        availableBalance={inputAvailableBalance()}
                        remainingDailyLimit={remainingDailyLimit}
                      />
                    </div>
                    <div className="hidden lg:flex flex-col">
                      <div className="w-fit flex py-1 2xl:py-2 px-3 bg-gray-200 items-center rounded-3xl justify-center self-end">
                        <div className="w-5 h-5 rounded-full overflow-hidden -ml-1 mr-2 relative">
                          <Image
                            src={fromNetwork.icon}
                            fill
                            sizes="20px"
                            alt={t('network_icon_alt', {
                              network: fromNetwork.name,
                            })}
                            className="rounded-full object-cover"
                          />
                        </div>
                        <div className="font-bold text-[12.85px]">{fromToken}</div>
                      </div>
                      <div className="flex justify-end mt-2 gap-1 items-center">
                        <div
                          className="font-poppins font-medium text-[12px] leading-[100%] tracking-[-0.03em] text-gray-500 whitespace-nowrap flex items-center gap-1"
                          style={{ fontFeatureSettings: '"cpsp"' }}
                        >
                          {!isWrapping && !isConnected ? (
                            <div>{t('connect_to_view')}</div>
                          ) : (
                            <div>
                              {getBalance(true)}&nbsp;{fromToken}
                            </div>
                          )}
                        </div>
                        <button
                          className="w-[31px] h-[13px] flex items-center justify-center gap-[7px] border border-gray-500/50 rounded-3xl px-1.5 hover:cursor-pointer font-poppins font-medium text-[8px] leading-[100%] tracking-[0em]"
                          onClick={handleMaxAmount}
                        >
                          {t('max')}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center">
                {!isConnected ? (
                  <MainButton onClick={handleConnectClick} subText={t('eth_mainnet')}>
                    {t('connect_wallet')}
                  </MainButton>
                ) : (
                  <MainButton onClick={handleContinueClick} disabled={!isValid || isDisabled || ootleWrapInFlight}>
                    <div className="flex">
                      {t('continue')}
                      <FaArrowRight className="ml-2" />
                    </div>
                  </MainButton>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
