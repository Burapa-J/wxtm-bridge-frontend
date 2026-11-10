import useAppStore from '@/store/app'
import {
  BackendBridgeTransaction,
  TransactionInfo,
  CombinedBridgeTransaction,
} from '@/types/transactions'
import {
  UserTransactionDTO,
  UserUnwrappedTransactionDTO,
} from '@tari-project/wxtm-bridge-backend-api'

function formatTimeStamp(timestamp: number): string {
  const appLanguage = useAppStore.getState().language
  return new Date(timestamp * 1000)?.toLocaleString(appLanguage, {
    month: 'short',
    day: '2-digit',
    hourCycle: 'h23',
    hour: 'numeric',
    minute: 'numeric',
  })
}

/** @TODO Refactor createdAt for unwraps into timestamp */
function formatBridgeDateToTimestamp(date: string): number {
  //2025-05-28T08:53:02.859Z
  const dateObj = new Date(date)
  if (isNaN(dateObj.getTime())) {
    throw new Error('Invalid date format')
  }
  return Math.floor(dateObj.getTime() / 1000) // Convert to seconds
}

function getTimestampFromTransaction(
  transaction: TransactionInfo | CombinedBridgeTransaction,
): number {
  if (isTransactionInfo(transaction)) {
    return transaction.timestamp
  } else {
    return formatBridgeDateToTimestamp(transaction.createdAt)
  }
}

function findFirstNonBridgeTransaction(
  transactions: (TransactionInfo | BackendBridgeTransaction)[],
): TransactionInfo | undefined {
  return transactions.find(
    (tx) => 'direction' in tx && tx.direction !== undefined,
  ) as TransactionInfo | undefined
}

function findByTransactionId(
  transactions: (TransactionInfo | BackendBridgeTransaction)[],
  txId: number | undefined,
): TransactionInfo | undefined {
  return transactions.find((tx) => 'tx_id' in tx && tx.tx_id === txId) as
    | TransactionInfo
    | undefined
}

function isBridgeTransaction(
  transaction: TransactionInfo | CombinedBridgeTransaction,
): transaction is CombinedBridgeTransaction {
  return (
    'type' in transaction &&
    (transaction.type === 'wrap' || transaction.type === 'unwrap')
  )
}

function isTransactionInfo(
  transaction: TransactionInfo | CombinedBridgeTransaction,
): transaction is TransactionInfo {
  return 'tx_id' in transaction && typeof transaction.tx_id === 'string'
}

const getStatusInfo = (
  status:
    | UserTransactionDTO.status
    | UserUnwrappedTransactionDTO.status
    | undefined,
) => {
  if (
    // Wrap
    status === UserTransactionDTO.status.PENDING ||
    status === UserTransactionDTO.status.PROCESSING ||
    status === UserTransactionDTO.status.TOKENS_RECEIVED ||
    // Unwrap
    status === UserUnwrappedTransactionDTO.status.PENDING ||
    status === UserUnwrappedTransactionDTO.status.PROCESSING
  ) {
    return {
      statusType: 'pending' as const,
      text: 'Pending',
      showIcon: true,
    }
  }
  if (
    status === UserTransactionDTO.status.SUCCESS ||
    status === UserUnwrappedTransactionDTO.status.SUCCESS
  ) {
    return {
      statusType: 'completed' as const,
      text: 'Completed',
      showIcon: false,
    }
  }
  if (status === UserTransactionDTO.status.TIMEOUT) {
    return { statusType: 'timeout' as const, text: 'Timeout', showIcon: false }
  } else if (status === UserUnwrappedTransactionDTO.status.ERROR) {
    return { statusType: 'error' as const, text: 'Error', showIcon: false }
  }
  return { statusType: 'default' as const, text: status, showIcon: false }
}

export {
  formatTimeStamp,
  findFirstNonBridgeTransaction,
  findByTransactionId,
  isBridgeTransaction,
  isTransactionInfo,
  getTimestampFromTransaction,
  getStatusInfo,
}
