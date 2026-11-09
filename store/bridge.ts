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
  // Id of the bridge start (Ootle or wXTM wrap) currently running ('' if none). Claimed synchronously
  // before the start's first await and held until it returns, so two starts can't both pass the
  // unfinished-wrap check and then race for Universe's single ongoing-tx slot.
  bridgeStartId: string
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
  bridgeStartId: '',
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
// Takes the in-flight lock for paymentId when it is free or already this wrap's; false when another wrap holds it.
export const lockOotleWrapInFlight = (paymentId: string): boolean => {
  const held = useBridgeStore.getState().ootleWrapInFlightId
  if (held && held !== paymentId) return false
  if (!held) useBridgeStore.setState({ ootleWrapInFlightId: paymentId })
  return true
}
export const releaseOotleWrapInFlight = (paymentId: string) => {
  if (useBridgeStore.getState().ootleWrapInFlightId === paymentId) useBridgeStore.setState({ ootleWrapInFlightId: '' })
}
// Check-and-set in one synchronous step: returns the claim id, or '' when another start holds it.
export const claimBridgeStart = (): string => {
  if (useBridgeStore.getState().bridgeStartId) return ''
  const id = crypto.randomUUID()
  useBridgeStore.setState({ bridgeStartId: id })
  return id
}
export const releaseBridgeStart = (id: string) => {
  if (id && useBridgeStore.getState().bridgeStartId === id) useBridgeStore.setState({ bridgeStartId: '' })
}
export const setBridgeError = (bridgeError: string) =>
  useBridgeStore.setState({ bridgeError, unconfirmedPaymentId: '' })
export const setUnconfirmedError = (bridgeError: string, paymentId: string) =>
  useBridgeStore.setState({ bridgeError, unconfirmedPaymentId: paymentId })

export const setUnwrapFailed = (unwrapFailed: boolean) => useBridgeStore.setState({ unwrapFailed })
export const setUnwrapSuccess = (unwrapSuccess: boolean) => useBridgeStore.setState({ unwrapSuccess })
export const setExceededDailyLimit = (exceededDailyLimit: boolean) => useBridgeStore.setState({ exceededDailyLimit })
