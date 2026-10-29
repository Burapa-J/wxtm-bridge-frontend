import { useMutation } from '@tanstack/react-query'

import {
  OotleTokensUnwrappedService,
  OotleUserUnwrapTransactionDTO,
  OotleUserWrapTransactionDTO,
  OotleWrapTokenService,
  TokensUnwrappedService,
  UserTransactionDTO,
  UserUnwrappedTransactionDTO,
  WrapTokenService,
} from '@tari-project/wxtm-bridge-backend-api'

import { OngoingUserTransaction } from '@/types/tapplet'
import { BackendBridgeTransaction, BackendUnwrapTransaction, CombinedBridgeTransaction } from '@/types/transactions'
import {
  getBackendBridgeTxsFromTU,
  removeOngoingTransaction,
  setBackendBridgeTxs,
  setBackendUnwrapTxs,
  setCombinedBridgeTxs,
  setLastOngoingBridgeTx,
  useTariAccountStore,
} from '@/store/account'

const OOTLE_PAGE_LIMIT = 100

async function fetchAllPages<T>(
  fetchPage: (limit: number, offset: number) => Promise<{ transactions: T[]; total: number }>,
): Promise<T[]> {
  const all: T[] = []
  while (true) {
    const page = await fetchPage(OOTLE_PAGE_LIMIT, all.length)
    all.push(...page.transactions)
    if (page.transactions.length === 0 || all.length >= page.total) return all
  }
}

// Ootle wrap listings carry a display reference instead of the paymentId; it stands in as the key.
function fromOotleWrap(tx: OotleUserWrapTransactionDTO): BackendBridgeTransaction {
  return {
    paymentId: tx.reference,
    tokenAmount: tx.tokenAmount,
    amountAfterFee: tx.amountAfterFee,
    feeAmount: tx.feeAmount,
    createdAt: tx.createdAt,
    transactionHash: tx.transactionHash,
    destinationAddress: tx.destinationAddress,
    // Same status strings as the wXTM listing.
    status: tx.status as string as UserTransactionDTO.status,
    ootleChainId: tx.toChainId,
  }
}

function fromOotleUnwrap(tx: OotleUserUnwrapTransactionDTO): BackendUnwrapTransaction {
  return {
    paymentId: tx.paymentId,
    amount: tx.amount,
    amountAfterFee: tx.amountAfterFee,
    feeAmount: tx.feeAmount,
    createdAt: tx.createdAt,
    transactionHash: tx.transactionHash,
    blockTimestamp: tx.blockTimestamp,
    destinationAddress: tx.destinationAddress,
    status: tx.status as string as UserUnwrappedTransactionDTO.status,
    ootleChainId: tx.chainId,
  }
}

async function getOotleTransactions(
  ootleAddress: string | undefined,
): Promise<{ wraps: BackendBridgeTransaction[]; unwraps: BackendUnwrapTransaction[] }> {
  if (!ootleAddress) return { wraps: [], unwraps: [] }
  try {
    const wraps = await fetchAllPages((limit, offset) =>
      OotleWrapTokenService.getOotleUserWrapTransactions(ootleAddress, limit, offset),
    )
    const unwraps = await fetchAllPages((limit, offset) =>
      OotleTokensUnwrappedService.getOotleUserUnwrapTransactions(ootleAddress, limit, offset),
    )
    return { wraps: wraps.map(fromOotleWrap), unwraps: unwraps.map(fromOotleUnwrap) }
  } catch (error) {
    console.error('[ TAPPLET-BRIDGE ] failed to get Ootle transactions:', error)
    return { wraps: [], unwraps: [] }
  }
}

export const useBridgeTransaction = () => {
  const ongoingBridgeTx = useTariAccountStore((s) => s.ongoingBridgeTx)
  const lastOngoingPaymentIdFromTU = useTariAccountStore((s) => s.lastOngoingPaymentIdFromTU)
  const tariAccount = useTariAccountStore((s) => s.tariAccount)
  const ootleAccount = useTariAccountStore((s) => s.ootleAccount)
  const getUserWrapTxs = useMutation({
    mutationFn: WrapTokenService.getUserTransactions,
  })
  const getUserUnwrapTxs = useMutation({
    mutationFn: TokensUnwrappedService.getUserTransactions,
  })

  /**
   * Fetch user bridge transactions and update the store's ongoing transaction state.
   * Returns the updated ongoing transaction or null if none.
   */
  const getUserBackendBridgeTxs = async (getFromTU = false): Promise<OngoingUserTransaction | null> => {
    const walletAddress = tariAccount?.address
    console.debug(`[ TAPPLET-BRIDGE ]  tariAccount address =`, walletAddress)
    if (!tariAccount || !walletAddress?.length) return null

    console.debug(`[ TAPPLET-BRIDGE ] get txs from ${getFromTU ? 'TU' : 'backend'}`)

    let wrapTransactions: BackendBridgeTransaction[]
    let unwrapTransactions: BackendUnwrapTransaction[] = []
    let combinedTransactions: CombinedBridgeTransaction[]

    if (getFromTU) {
      /** @TODO We would need to add getter for unwraps in TU and add those in below combinedTransactions */
      wrapTransactions = await getBackendBridgeTxsFromTU()
      combinedTransactions = wrapTransactions.map((tx) => ({
        ...tx,
        type: 'wrap' as const,
      }))
    } else {
      const wrapResult = await getUserWrapTxs.mutateAsync(walletAddress)
      const unwrapResult = await getUserUnwrapTxs.mutateAsync(walletAddress)
      const ootle = await getOotleTransactions(ootleAccount?.address)

      wrapTransactions = [...wrapResult.transactions, ...ootle.wraps]
      unwrapTransactions = [...unwrapResult.transactions, ...ootle.unwraps]

      setBackendBridgeTxs(wrapTransactions)
      setBackendUnwrapTxs(unwrapTransactions)
      setCombinedBridgeTxs(wrapTransactions, unwrapTransactions)

      combinedTransactions = [
        ...wrapTransactions.map((tx) => ({ ...tx, type: 'wrap' as const })),
        ...unwrapTransactions.map((tx) => ({ ...tx, type: 'unwrap' as const })),
      ]

      combinedTransactions.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime()
        const dateB = new Date(b.createdAt).getTime()
        return dateB - dateA // Sort descending by date
      })
    }

    if (Array.isArray(combinedTransactions) && combinedTransactions.length > 0) {
      // Find a pending transaction (checking both wrap and unwrap statuses)
      const ongoing = combinedTransactions.find((tx) => {
        if (tx.type === 'wrap') {
          return (
            tx.status === UserTransactionDTO.status.PENDING ||
            tx.status === UserTransactionDTO.status.PROCESSING ||
            tx.status === UserTransactionDTO.status.TOKENS_RECEIVED
          )
        } else {
          return (
            tx.status === UserUnwrappedTransactionDTO.status.PENDING ||
            tx.status === UserUnwrappedTransactionDTO.status.PROCESSING
          )
        }
      })
      if (ongoing) {
        if (
          (ongoing.paymentId !== ongoingBridgeTx?.paymentId || ongoing.status !== ongoingBridgeTx?.status) &&
          (!ongoingBridgeTx || new Date(ongoing.createdAt).getTime() > new Date(ongoingBridgeTx?.createdAt).getTime())
        ) {
          const ongoingTransaction: OngoingUserTransaction = ongoing
          setLastOngoingBridgeTx(ongoingTransaction)
        }
        return ongoing
      }

      // If no pending tx found, but previously had one, check if it succeeded/failed
      // check also with the paymentId from the TU to display modal after the bridge relaunch
      const validPaymentIds = new Set([ongoingBridgeTx?.paymentId, lastOngoingPaymentIdFromTU])
      const ongoingCompleted = combinedTransactions.find((tx) => {
        const paymentId = tx.paymentId
        const hasValidPaymentId = validPaymentIds.has(paymentId)

        if (tx.type === 'wrap') {
          return (
            hasValidPaymentId &&
            (tx.status === UserTransactionDTO.status.SUCCESS || tx.status === UserTransactionDTO.status.TIMEOUT)
          )
        } else {
          return (
            hasValidPaymentId &&
            (tx.status === UserUnwrappedTransactionDTO.status.SUCCESS ||
              tx.status === UserUnwrappedTransactionDTO.status.ERROR)
          )
        }
      })

      if (ongoingCompleted) {
        const ongoingTransaction: OngoingUserTransaction = {
          ...ongoingCompleted,
          showModal: true,
        }
        setLastOngoingBridgeTx(ongoingTransaction)
        return ongoingTransaction
      }
    } else {
      // No transactions found, clear any pending transaction
      removeOngoingTransaction()
    }

    return null
  }

  return {
    getUserBackendBridgeTxs,
  }
}
