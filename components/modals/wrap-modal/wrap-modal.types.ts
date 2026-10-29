import { MainModalProps } from '@/components/modals/main-modal'
import { BridgeFees } from '@/hooks/use-bridge-fees'
import { CombinedBridgeTransaction } from '@/types/transactions'
import { AssetConfig } from '@/utils/bridge-route'

export type WrapModalProps = {
  closeModalAction: () => void
  feesData: BridgeFees
  amountAfterFee?: string
  destinationAddress?: string
  transactionStatus?: CombinedBridgeTransaction
  type: 'wrap' | 'unwrap'
  // the transaction's asset; defaults to the selected route's
  asset?: AssetConfig
} & Pick<MainModalProps, 'tariWalletAddress' | 'ethereumAddress'>
