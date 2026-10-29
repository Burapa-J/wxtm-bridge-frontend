import type { NetworkOption } from '@/store/bridge'

export type Network = {
  name: string
  icon: string
  token: string
  option: NetworkOption
}

export type NetworkBoxProps = {
  type: 'from' | 'to'
  selected: Network
  isOpen: boolean
  networks: Network[]
  onToggle: () => void
  onSelect: (network: Network) => void
  fromNetwork?: Network
}
