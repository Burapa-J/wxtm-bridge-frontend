import { MainModalProps } from '@/components/modals/main-modal'
import { CombinedBridgeTransaction } from '@/types/transactions'
import { AssetConfig } from '@/utils/bridge-route'

export type SuccessModalProps = {
  closeModalAction: () => void
  detailedTx?: CombinedBridgeTransaction
  type: 'wrap' | 'unwrap'
  // the transaction's asset; defaults to the selected route's
  asset?: AssetConfig
} & Pick<MainModalProps, 'amount' | 'tariWalletAddress' | 'ethereumAddress'>
