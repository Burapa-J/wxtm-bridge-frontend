import { useConnection } from 'wagmi'
import useAppStore from '@/store/app'
import { useBridgeStore } from '@/store/bridge'
import { getNetworkChoices, getWxtmAsset, resolveSelection } from '@/utils/bridge-route'

// The selected from/to networks, the route between them, and everything the selector can offer.
export const useBridgeRoute = () => {
  const { chain } = useConnection()
  const isMainNet = useAppStore((s) => s.isMainNet)
  const wrapFeeBps = useBridgeStore((s) => s.wrapTokenFeePercentageBps)
  const unwrapFeeBps = useBridgeStore((s) => s.unwrapTokenFeePercentageBps)
  const ootleAssets = useBridgeStore((s) => s.ootleAssets)
  const fromNetwork = useBridgeStore((s) => s.fromNetwork)
  const toNetwork = useBridgeStore((s) => s.toNetwork)

  const assets = [getWxtmAsset(chain?.id, isMainNet, wrapFeeBps, unwrapFeeBps), ...ootleAssets]
  const networks = getNetworkChoices(assets)
  const { from, to, route } = resolveSelection(fromNetwork.name, toNetwork.name, networks, assets)

  return { assets, networks, from, to, route }
}
