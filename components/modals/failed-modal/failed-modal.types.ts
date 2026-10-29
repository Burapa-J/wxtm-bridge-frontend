import { AssetConfig } from '@/utils/bridge-route'

export type FailedModalProps = {
  closeModalAction: () => void
  paymentId?: string
  fromNetwork?: string
  // the transaction's asset; see getTransactionLabels
  asset?: AssetConfig
  ootleChainId?: number
}
