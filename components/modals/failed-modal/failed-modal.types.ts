import { AssetConfig } from '@/utils/bridge-route'

export type FailedModalProps = {
  closeModalAction: () => void
  paymentId?: string
  // Opened from the transaction history: closing only closes this view.
  fromHistory?: boolean
  fromNetwork?: string
  // the transaction's asset; see getTransactionLabels
  asset?: AssetConfig
  ootleChainId?: number
}
