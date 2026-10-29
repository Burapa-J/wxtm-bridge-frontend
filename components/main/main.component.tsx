'use client'

import React, { useState } from 'react'

import { MainComponentProps } from './main.types'
import { useTranslation } from 'react-i18next'
import { TransactionHistory } from '../history/history.component'
import { BridgeForm } from '../bridge-form/bridge-form.component'
import { HomeText } from './home-text'
import { useTariAccountStore } from '@/store/account'

import { useBridgeStatus } from '@/hooks/use-bridge-status'
import { useBridgeStore } from '@/store/bridge'
import { useBridgeRoute } from '@/hooks/use-bridge-route'

// TODO - add translation keys

export const MainComponent = ({ remainingDailyLimit }: MainComponentProps) => {
  const { t } = useTranslation('main', { useSuspense: false })
  const [showHistory, setShowHistory] = useState(false)
  const exceededDailyLimit = useBridgeStore((s) => s.exceededDailyLimit)
  const bridgeTxs = useTariAccountStore((s) => s.combinedBridgeTxs)
  const ootleUnavailable = useBridgeStore((s) => s.ootleUnavailable)
  const ootleAssets = useBridgeStore((s) => s.ootleAssets)
  const ootleWrapInFlight = useBridgeStore((s) => s.ootleWrapInFlight)
  const { route } = useBridgeRoute()

  const notices: string[] = []
  if (ootleUnavailable) notices.push(t('ootle_unavailable'))
  for (const asset of ootleAssets) {
    if (asset.status === 'unwrap_only')
      notices.push(t('chain_retiring', { token: asset.evmToken, chain: asset.chainName }))
  }
  if (route.asset.kind === 'ootle') notices.push(t('ootle_no_peg_out'))
  if (ootleWrapInFlight) notices.push(t('ootle_wrap_in_flight'))

  const { isOffline } = useBridgeStatus()

  const offlineMarkup = isOffline ? (
    <div className="flex items-center w-full mx-auto absolute -translate-y-full -top-8">
      <div className="flex flex-col gap-1 items-center p-[25px] w-full rounded-4xl bg-white/30 backdrop-blur-sm  shadow-lg">
        <div className="font-semibold text-center leading-none text-2xl text-black font-poppins flex">
          The bridge is currently down for maintenance.
        </div>
        <div className="font-medium text-center leading-none text-xl text-black font-poppins  flex">
          We&#39;ll be back up and running soon! Thanks for your patience!
        </div>
      </div>
    </div>
  ) : null

  const bridgingMarkup = <BridgeForm remainingDailyLimit={remainingDailyLimit} />

  const mainMarkup = !isOffline ? (
    <div className="mt-6">
      {exceededDailyLimit && (
        <div className="flex items-center justify-center w-[clamp(480px,50vw,800px)]">
          <div className="p-4 rounded-2xl bg-white/25 backdrop-blur-sm shadow-lg">
            <div className="font-light leading-none text-[16px] text-center text-pretty text-balance">
              We cannot process your transaction because{' '}
              <span className="font-medium">the transaction limit has been reached for the day.</span> Please try again
              tomorrow.
            </div>
          </div>
        </div>
      )}
      {notices.map((notice) => (
        <div key={notice} className="flex items-center justify-center w-[clamp(480px,50vw,800px)] mt-2">
          <div className="p-3 rounded-2xl bg-white/25 backdrop-blur-sm shadow-lg">
            <div className="font-light leading-none text-[14px] text-center text-pretty text-balance">{notice}</div>
          </div>
        </div>
      ))}
      <div
        className="mb-4 mt-6 flex gap-2"
        style={{
          color: '#000',
          fontFamily: 'Poppins, sans-serif',
          fontSize: '20px',
          fontStyle: 'normal',
          fontWeight: 510,
          lineHeight: '30px',
          letterSpacing: '-1px',
        }}
      >
        <button
          className={`${!showHistory ? 'text-black' : 'text-[#797979] hover:cursor-pointer'}`}
          onClick={() => setShowHistory(false)}
          type="button"
        >
          {t('start_bridging')}
        </button>
        <span className="text-black"> | </span>
        <button
          className={`${showHistory ? 'text-black' : 'text-[#797979] hover:cursor-pointer'}`}
          onClick={() => setShowHistory(true)}
          type="button"
        >
          {t('history')} ({bridgeTxs.length})
        </button>
      </div>

      {showHistory ? <TransactionHistory /> : bridgingMarkup}
    </div>
  ) : null

  return (
    <section className="w-full h-full mx-auto relative md:w-[90vw] lg:w-[85vw]">
      {offlineMarkup}
      <HomeText />
      {mainMarkup}
    </section>
  )
}
