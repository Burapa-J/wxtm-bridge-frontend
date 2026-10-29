import { UserTransactionDTO, UserUnwrappedTransactionDTO } from '@tari-project/wxtm-bridge-backend-api'

export interface TransactionInfo {
  tx_id: number
  source_address: string
  dest_address: string
  status: number
  direction: number
  amount: number
  fee: number
  is_cancelled: boolean
  excess_sig: string
  timestamp: number
  message: string
  payment_id: string
  mined_in_block_height?: number
  payment_reference?: string
}

export enum TransactionDirection {
  Inbound = 1,
  Outbound = 2,
}

export enum TransactionStatus {
  Completed = 0,
  Broadcast = 1,
  MinedUnconfirmed = 2,
  Imported = 3,
  Pending = 4,
  Coinbase = 5,
  MinedConfirmed = 6,
  Rejected = 7,
  OneSidedUnconfirmed = 8,
  OneSidedConfirmed = 9,
  Queued = 10,
  NotFound = 11,
  CoinbaseUnconfirmed = 12,
  CoinbaseConfirmed = 13,
  CoinbaseNotInBlockChain = 14,
}

export interface BaseItemProps {
  title: string
  direction: TransactionDirection
  time: string
  value: string
  chip?: string
  status?: number
  onClick?: () => void
}

export interface BridgeBaseItemProps {
  title: string
  time: string
  value: string
  chip?: string
  status?: UserTransactionDTO.status | UserUnwrappedTransactionDTO.status
  address?: string
  transactionHash?: string
  onClick?: () => void
  transactionType?: 'wrap' | 'unwrap'
  // e.g. "wTARI · Base"
  badge?: string
  currency?: string
  explorerUrl?: string
}

export interface BridgeHistoryListItemProps {
  item: CombinedBridgeTransaction
  index: number
  itemIsNew?: boolean
  setDetailedTx?: (item: CombinedBridgeTransaction | null) => void
}

// ootleChainId is set only for Ootle (TARI <-> wTARI) transactions.
export interface BackendBridgeTransaction extends UserTransactionDTO {
  sourceAddress?: string
  mined_in_block_height?: number
  ootleChainId?: number
}

export interface BackendUnwrapTransaction extends UserUnwrappedTransactionDTO {
  sourceAddress?: string
  mined_in_block_height?: number
  ootleChainId?: number
}

export type CombinedBridgeTransaction =
  | (BackendBridgeTransaction & { type: 'wrap' })
  | (BackendUnwrapTransaction & { type: 'unwrap' })
