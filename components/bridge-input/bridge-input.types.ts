import { BridgeRoute } from '@/utils/bridge-route'

export type BridgeFormValues = {
  amount: string
}

export type BridgeInputProps = {
  route: BridgeRoute
  availableBalance: number
  remainingDailyLimit?: number
}
