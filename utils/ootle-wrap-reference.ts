import { utils } from 'ethers'

// The backend's display reference for an Ootle wrap, which its user listing returns instead of the paymentId.
export function ootleWrapReference(paymentId: string): string {
  return utils.sha256(utils.toUtf8Bytes(`ootle-wrap-reference:${paymentId}`)).slice(2, 18)
}

// Whether a listing row is the transaction known locally by id, which is a paymentId or, for rows
// taken from the listing, already an Ootle wrap reference.
export function isSameTransaction(
  row: { type: 'wrap' | 'unwrap'; paymentId: string; ootleChainId?: number },
  id: string | undefined,
): boolean {
  if (row.paymentId === id) return true
  if (!id || row.type !== 'wrap' || row.ootleChainId === undefined) return false
  return row.paymentId === ootleWrapReference(id)
}
