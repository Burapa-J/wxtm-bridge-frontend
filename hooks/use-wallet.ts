import { useWalletClient } from 'wagmi'
import { AssetConfig } from '@/utils/bridge-route'

export const useWalletUtils = () => {
  const { data: walletClient } = useWalletClient()
  const addTokenToWalletAction = async (asset: AssetConfig) => {
    try {
      return walletClient?.request({
        method: 'wallet_watchAsset',
        params: {
          type: 'ERC20',
          options: {
            address: asset.tokenAddress,
            symbol: asset.evmToken,
            decimals: asset.evmDecimals,
            image: 'https://tari.com/favicon.png?v=1',
          },
        },
      })
    } catch (error) {
      console.error('Failed to ask wallet to watch asset:', error)
      return false
    }
  }

  return {
    addTokenToWalletAction,
  }
}
