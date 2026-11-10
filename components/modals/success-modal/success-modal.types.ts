import { MainModalProps } from '@/components/modals/main-modal'
import { CombinedBridgeTransaction } from '@/types/transactions'
import { AssetConfig } from '@/utils/bridge-route'

export type SuccessModalProps = {
  closeModalAction: () => void
  detailedTx?: CombinedBridgeTransaction
  type: 'wrap' | 'unwrap'
  // the transaction's asset; without one, a non-Ootle tx uses the selected route's
  asset?: AssetConfig
  ootleChainId?: number
} & Pick<MainModalProps, 'amount' | 'tariWalletAddress' | 'ethereumAddress'>
