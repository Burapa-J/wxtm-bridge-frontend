import { useCallback } from 'react'
import { OotleTokensUnwrappedService, TokensUnwrappedService } from '@tari-project/wxtm-bridge-backend-api'
import { microXtmToXtm } from '@/utils/parse-wxtm-token-amount'
import { AssetConfig } from '@/utils/bridge-route'

export function useFetchDailyLimit(asset: AssetConfig) {
  const { kind, chainId } = asset
  return useCallback(async () => {
    try {
      const limitMicro =
        kind === 'ootle'
          ? await OotleTokensUnwrappedService.getOotleRemainingDailyLimit(chainId)
          : await TokensUnwrappedService.getRemainingDailyLimit()
      return microXtmToXtm(limitMicro)
    } catch (error) {
      console.error('[ TAPPLET-BRIDGE ] Failed to fetch daily limit:', error)
    }
  }, [kind, chainId])
}
