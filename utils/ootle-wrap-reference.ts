import { utils } from 'ethers'

// The backend's display reference for an Ootle wrap, which its user listing returns instead of the paymentId.
export function ootleWrapReference(paymentId: string): string {
  return utils.sha256(utils.toUtf8Bytes(`ootle-wrap-reference:${paymentId}`)).slice(2, 18)
}
