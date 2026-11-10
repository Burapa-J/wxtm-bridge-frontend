import {
  UserTransactionDTO,
  UserUnwrappedTransactionDTO,
} from '@tari-project/wxtm-bridge-backend-api'

export interface AccountData {
  account_id: number
  address: string
}

export interface WalletBalance {
  available_balance: number
  timelocked_balance: number
  pending_incoming_balance: number
  pending_outgoing_balance: number
}

export interface PendingBridgeTx {
  paymentId: string
}

// Discriminated by `type`, never by which amount fields happen to be present.
export type OngoingUserTransaction = (
  | (Omit<UserTransactionDTO, 'feeAmount'> & { type: 'wrap' })
  | (Omit<UserUnwrappedTransactionDTO, 'feeAmount'> & { type: 'unwrap' })
) & {
  showModal?: boolean
  // set only for Ootle (TARI <-> wTARI) transactions
  ootleChainId?: number
}
