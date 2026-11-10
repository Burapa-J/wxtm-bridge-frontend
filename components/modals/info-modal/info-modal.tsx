import React from 'react'
import Image from 'next/image'

import { Trans, useTranslation } from 'react-i18next'
import { useBridgeRoute } from '@/hooks/use-bridge-route'

export const InfoModal: React.FC = ({}) => {
  const { t } = useTranslation('main', { useSuspense: false })
  // shown while signing an unwrap, so the selected route is the one in progress
  const { evmToken } = useBridgeRoute().route.asset

  return (
    <div className="w-full flex flex-col p-6">
      <div className="mt-2">
        <div className="flex flex-col items-center justify-center">
          <div className="w-[49px] h-[49px] rounded-full overflow-hidden mr-1 relative">
            <Image
              src="/icons/clock.png"
              fill
              sizes="49px"
              alt="Clock"
              className="rounded-full object-cover"
            />
          </div>
          <div className="font-semibold text-lg mt-2">{t('unwrap_info')}</div>
          <div className="font-normal text-xs mt-2 text-center px-3">
            <Trans
              i18nKey="unwrap_info_message"
              values={{ evmToken }}
              components={{ bold: <span className="font-bold" /> }}
            />
          </div>
        </div>

        <div className="flex flex-col my-4 w-full items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-b-[3px] bg-transparent border-r-black"></div>
        </div>
      </div>
    </div>
  )
}
