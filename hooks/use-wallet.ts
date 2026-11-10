import { useConfig } from 'wagmi'
import { getConnection, getWalletClient, switchChain } from 'wagmi/actions'
import { AssetConfig } from '@/utils/bridge-route'

export const useWalletUtils = () => {
  const config = useConfig()

  // Reads the wallet when called, so it is current even after a long wait.
  const isWalletOnChain = (chainId: number) => getConnection(config).chainId === chainId

  // Rejects when the wallet refuses the chain switch or the request.
  const addTokenToWalletAction = async (asset: AssetConfig, switchToAssetChain = false) => {
    if (switchToAssetChain && !isWalletOnChain(asset.chainId)) {
      await switchChain(config, { chainId: asset.chainId })
    }
    const walletClient = await getWalletClient(config)
    return walletClient.request({
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
  }

  return {
    addTokenToWalletAction,
    isWalletOnChain,
  }
}
