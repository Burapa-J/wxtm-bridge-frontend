import { useMutation } from '@tanstack/react-query'

import {
  OotleTokensUnwrappedService,
  OotleUserUnwrapTransactionDTO,
  OotleUserWrapTransactionDTO,
  OotleWrapDetailsDTO,
  OotleWrapTokenService,
  TokensUnwrappedService,
  UserTransactionDTO,
  UserUnwrappedTransactionDTO,
  WrapTokenService,
} from '@tari-project/wxtm-bridge-backend-api'

import { OngoingUserTransaction } from '@/types/tapplet'
import { isSameTransaction } from '@/utils/ootle-wrap-reference'
import { loadOotleWrapCapabilities } from '@/utils/ootle-wrap-capabilities'
import { errorSummary } from '@/utils/error-summary'
import useAppStore from '@/store/app'
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
// Stops a misbehaving backend from keeping this loop going.
const OOTLE_MAX_PAGES = 50

export async function fetchAllPages<T>(
  fetchPage: (limit: number, offset: number) => Promise<{ transactions: T[]; total: number }>,
): Promise<T[]> {
  const all: T[] = []
  for (let i = 0; i < OOTLE_MAX_PAGES; i++) {
    const page = await fetchPage(OOTLE_PAGE_LIMIT, all.length)
    all.push(...page.transactions)
    const total = Number(page.total)
    if (page.transactions.length === 0 || !Number.isFinite(total) || all.length >= total) break
  }
  return all
}

// Ootle wrap listings carry a display reference instead of the paymentId; it stands in as the key.
// The public listing has no amounts, destination or transaction hash; those come only from the
// clientToken-gated lookup. Without them the row is marked detailsHidden and shows chain, time and
// status only (the amount fields are placeholders that must not be displayed).
export function fromOotleWrap(
  tx: OotleUserWrapTransactionDTO,
  details?: OotleWrapDetailsDTO,
): BackendBridgeTransaction {
  const base = {
    paymentId: tx.reference,
    createdAt: tx.createdAt,
    // Same status strings as the wXTM listing.
    status: tx.status as string as UserTransactionDTO.status,
    ootleChainId: tx.toChainId,
  }
  if (!details) {
    return {
      ...base,
      tokenAmount: '0',
      amountAfterFee: '0',
      feeAmount: '0',
      destinationAddress: '',
      detailsHidden: true,
    }
  }
  return {
    ...base,
    tokenAmount: details.tokenAmount,
    amountAfterFee: details.amountAfterFee,
    feeAmount: details.feeAmount,
    transactionHash: details.transactionHash,
    destinationAddress: details.destinationAddress,
  }
}

// Details for this account's wraps whose clientToken we still hold, keyed by reference. The tokens
// travel only in the lookup's request body; failures are logged without the request.
async function lookupOotleWrapDetails(ootleAddress: string): Promise<Map<string, OotleWrapDetailsDTO>> {
  const wraps = loadOotleWrapCapabilities(useAppStore.getState().network, ootleAddress)
  const byReference = new Map<string, OotleWrapDetailsDTO>()
  if (!wraps.length) return byReference
  try {
    const { transactions } = await OotleWrapTokenService.lookupOotleWraps({ wraps })
    for (const details of transactions) byReference.set(details.reference, details)
  } catch (error) {
    console.error('[ TAPPLET-BRIDGE ] Ootle wrap details lookup failed: ', errorSummary(error))
  }
  return byReference
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

export async function getOotleTransactions(
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
    const details = await lookupOotleWrapDetails(ootleAddress)
    return {
      wraps: wraps.map((tx) => fromOotleWrap(tx, details.get(tx.reference))),
      unwraps: unwraps.map(fromOotleUnwrap),
    }
  } catch (error) {
    console.error('[ TAPPLET-BRIDGE ] failed to get Ootle transactions:', error)
    return { wraps: [], unwraps: [] }
  }
}

export const useBridgeTransaction = () => {
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
      const { ongoingBridgeTx: localTx } = useTariAccountStore.getState()
      // An Ootle wrap without details can't fill a modal; it is used only to update a local record.
      const candidates = combinedTransactions.filter(
        (tx) => !(tx.type === 'wrap' && tx.detailsHidden) || isSameTransaction(tx, localTx?.paymentId),
      )
      // Find a pending transaction (checking both wrap and unwrap statuses)
      const ongoing = candidates.find((tx) => {
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
      // Read at call time: callers run this right after changing the ongoing tx.
      const { ongoingBridgeTx, lastOngoingPaymentIdFromTU } = useTariAccountStore.getState()

      if (ongoing) {
        // An Ootle wrap row is keyed by its reference; keep the local record (real paymentId, failed state).
        if (
          ongoing.type === 'wrap' &&
          ongoing.ootleChainId !== undefined &&
          ongoingBridgeTx?.type === 'wrap' &&
          isSameTransaction(ongoing, ongoingBridgeTx.paymentId)
        ) {
          if (
            ongoingBridgeTx.status !== UserTransactionDTO.status.TIMEOUT &&
            ongoingBridgeTx.status !== ongoing.status
          ) {
            setLastOngoingBridgeTx({ ...ongoingBridgeTx, status: ongoing.status } as OngoingUserTransaction)
          }
          return useTariAccountStore.getState().ongoingBridgeTx ?? null
        }
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
      const ongoingCompleted = candidates.find((tx) => {
        const hasValidPaymentId =
          isSameTransaction(tx, ongoingBridgeTx?.paymentId) || isSameTransaction(tx, lastOngoingPaymentIdFromTU)

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
        // A row without details only contributes its status to the local record's amounts and destination.
        const ongoingTransaction: OngoingUserTransaction =
          ongoingCompleted.type === 'wrap' && ongoingCompleted.detailsHidden && localTx?.type === 'wrap'
            ? { ...localTx, status: ongoingCompleted.status, showModal: true }
            : { ...ongoingCompleted, showModal: true }
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
