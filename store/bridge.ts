import { create } from 'zustand'
import { Network } from '@/components/network-box'
import type { AssetConfig } from '@/utils/bridge-route'

export type EvmNetworkOption = { kind: 'evm'; chainId: number }
export type NetworkOption = 'Tari' | 'Ootle' | EvmNetworkOption

interface BridgeConfigStoreState {
  fromNetwork: Network
  toNetwork: Network
  wrapTokenFeePercentageBps: number
  unwrapTokenFeePercentageBps: number
  tariColdWalletAddress: string
  unwrapFailed: boolean
  unwrapSuccess: boolean
  exceededDailyLimit: boolean
  ootleAssets: AssetConfig[]
  ootleColdAccountAddress: string
  ootleUnavailable: boolean
  // Shown in the failed modal instead of the generic failure text.
  bridgeError: string
}
const initialState: BridgeConfigStoreState = {
  wrapTokenFeePercentageBps: 50, // 0.5% fee
  unwrapTokenFeePercentageBps: 50, // 0.5% fee
  tariColdWalletAddress: '',
  // Placeholders until the route hook resolves them by name against the current networks.
  fromNetwork: { name: 'Tari', icon: '/icons/tari.png', token: 'XTM', option: 'Tari' },
  toNetwork: { name: 'Ethereum', icon: '/icons/eth.png', token: 'wXTM', option: { kind: 'evm', chainId: 1 } },
  unwrapFailed: false,
  unwrapSuccess: false,
  exceededDailyLimit: false,
  ootleAssets: [],
  ootleColdAccountAddress: '',
  ootleUnavailable: false,
  bridgeError: '',
}

export const useBridgeStore = create<BridgeConfigStoreState>()(() => ({
  ...initialState,
}))

export const setWrapTokenFeePercentageBps = (fee: number) =>
  useBridgeStore.setState({
    wrapTokenFeePercentageBps: fee,
  })

export const setUnwrapTokenFeePercentageBps = (fee: number) =>
  useBridgeStore.setState({
    unwrapTokenFeePercentageBps: fee,
  })

export const setTariColdWalletAddress = (address: string) =>
  useBridgeStore.setState({
    tariColdWalletAddress: address,
  })

export const setNetworks = (fromNetwork: Network, toNetwork: Network) =>
  useBridgeStore.setState({ fromNetwork, toNetwork })

export const setOotleConfig = (ootleAssets: AssetConfig[], ootleColdAccountAddress: string) =>
  useBridgeStore.setState({ ootleAssets, ootleColdAccountAddress })

export const setOotleUnavailable = (ootleUnavailable: boolean) => useBridgeStore.setState({ ootleUnavailable })
export const setBridgeError = (bridgeError: string) => useBridgeStore.setState({ bridgeError })

export const setUnwrapFailed = (unwrapFailed: boolean) => useBridgeStore.setState({ unwrapFailed })
export const setUnwrapSuccess = (unwrapSuccess: boolean) => useBridgeStore.setState({ unwrapSuccess })
export const setExceededDailyLimit = (exceededDailyLimit: boolean) => useBridgeStore.setState({ exceededDailyLimit })
