import { create } from 'zustand'
import { Network } from '@/components/network-box'
import type { AssetConfig } from '@/utils/bridge-route'

// asset matches AssetConfig['kind'], so wXTM and wTARI on the same chain stay distinct.
export type EvmNetworkOption = { kind: 'evm'; chainId: number; asset: 'wxtm' | 'ootle' }
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
  // paymentId of the Ootle wrap between its deposit and tokens-sent ('' if none); no new bridge may
  // start meanwhile, and only that wrap may release it.
  ootleWrapInFlightId: string
  // Shown in the failed modal instead of the generic failure text.
  bridgeError: string
  // paymentId of the stored record the bridgeError is about, when its deposit could not be confirmed;
  // the user may dismiss that record ('' if none).
  unconfirmedPaymentId: string
}
const initialState: BridgeConfigStoreState = {
  wrapTokenFeePercentageBps: 50, // 0.5% fee
  unwrapTokenFeePercentageBps: 50, // 0.5% fee
  tariColdWalletAddress: '',
  // Placeholders until the route hook resolves them by option against the current networks.
  fromNetwork: { name: 'Tari', icon: '/icons/tari.png', token: 'XTM', option: 'Tari' },
  toNetwork: {
    name: 'Ethereum',
    icon: '/icons/eth.png',
    token: 'wXTM',
    option: { kind: 'evm', chainId: 1, asset: 'wxtm' },
  },
  unwrapFailed: false,
  unwrapSuccess: false,
  exceededDailyLimit: false,
  ootleAssets: [],
  ootleColdAccountAddress: '',
  ootleUnavailable: false,
  ootleWrapInFlightId: '',
  bridgeError: '',
  unconfirmedPaymentId: '',
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
export const lockOotleWrapInFlight = (paymentId: string) => useBridgeStore.setState({ ootleWrapInFlightId: paymentId })
export const releaseOotleWrapInFlight = (paymentId: string) => {
  if (useBridgeStore.getState().ootleWrapInFlightId === paymentId) useBridgeStore.setState({ ootleWrapInFlightId: '' })
}
export const setBridgeError = (bridgeError: string) =>
  useBridgeStore.setState({ bridgeError, unconfirmedPaymentId: '' })
export const setUnconfirmedError = (bridgeError: string, paymentId: string) =>
  useBridgeStore.setState({ bridgeError, unconfirmedPaymentId: paymentId })

export const setUnwrapFailed = (unwrapFailed: boolean) => useBridgeStore.setState({ unwrapFailed })
export const setUnwrapSuccess = (unwrapSuccess: boolean) => useBridgeStore.setState({ unwrapSuccess })
export const setExceededDailyLimit = (exceededDailyLimit: boolean) => useBridgeStore.setState({ exceededDailyLimit })
