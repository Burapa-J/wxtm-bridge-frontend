import { useMemo } from 'react'
import { BridgeRoute } from '@/utils/bridge-route'

export type BridgeInfo = {
  fromToken: string
  toToken: string
  isWrapping: boolean
  destAddress?: string
  bridgeHandler?: () => void
}

export const useBridgeInfo = (
  route: BridgeRoute,
  ethereumAddress?: string,
  tariWalletAddress?: string,
  handleBridgeToEthereum?: () => void,
  handleBridgeToTari?: () => void,
): BridgeInfo => {
  return useMemo(() => {
    const isWrapping = route.isWrapping
    const { tariToken, evmToken } = route.asset

    const fromToken = isWrapping ? tariToken : evmToken
    const toToken = isWrapping ? evmToken : tariToken
    const destAddress = isWrapping ? ethereumAddress : tariWalletAddress
    const bridgeHandler = isWrapping
      ? handleBridgeToEthereum
      : handleBridgeToTari

    return { fromToken, toToken, isWrapping, destAddress, bridgeHandler }
  }, [
    route,
    ethereumAddress,
    tariWalletAddress,
    handleBridgeToEthereum,
    handleBridgeToTari,
  ])
}
