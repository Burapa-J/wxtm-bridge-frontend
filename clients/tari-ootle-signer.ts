import { SIGNER_SEND_TIMEOUT_MS, sendSignerCall } from './tari-l1-signer'

// Universe's Ootle (L2) signer methods, over the same signer-call channel as TariL1Signer.

export interface OotleAccount {
  address: string
  network: string
}

// micro TARI as decimal strings
export interface OotleBalance {
  available: string
  pending: string
}

export interface SendOotleStealthRequest {
  // micro TARI
  amount: string
  address: string
  // UUID v4
  payRef: string
}

// 'Pending' until final: 'Accepted', 'Rejected', 'InvalidTransaction' or 'OnlyFeeAccepted'.
export interface OotleTransactionResult {
  status: string
}

export type OotleSignerErrorCode = 'l2_unavailable' | 'busy' | 'denied' | 'failed' | 'invalid_arguments'

export class OotleSignerError extends Error {
  public constructor(public code: OotleSignerErrorCode) {
    super(`Ootle signer error: ${code}`)
  }
}

// Universe returns { error: 'l2_unavailable' } as a result when the Ootle wallet can't be used,
// and rejects with a string such as "Error: busy" for everything else.
export function toOotleSignerError(error: unknown): OotleSignerError {
  const text = typeof error === 'string' ? error : error instanceof Error ? error.message : ''
  if (text.includes('l2_unavailable')) return new OotleSignerError('l2_unavailable')
  if (text.includes('busy')) return new OotleSignerError('busy')
  if (text.includes('denied')) return new OotleSignerError('denied')
  if (text.includes('Invalid arguments')) return new OotleSignerError('invalid_arguments')
  return new OotleSignerError('failed')
}

// A timed-out call rejects with a plain error, which maps to 'failed'.
async function callOotleSigner(methodName: string, args: unknown[], timeoutMs?: number): Promise<unknown> {
  let result: unknown
  try {
    result = await sendSignerCall(methodName, args, timeoutMs)
  } catch (error) {
    throw toOotleSignerError(error)
  }
  if (!result || typeof result !== 'object') {
    throw new OotleSignerError('failed')
  }
  if ('error' in result) {
    throw toOotleSignerError(String(result.error))
  }
  return result
}

// Universe's reply must carry these string fields; anything else is treated as a failure.
function requireStrings(result: unknown, fields: string[]): void {
  const record = result as Record<string, unknown>
  for (const field of fields) {
    if (typeof record[field] !== 'string') throw new OotleSignerError('failed')
  }
}

export async function getOotleAccount(): Promise<OotleAccount> {
  const result = await callOotleSigner('getOotleAccount', [])
  requireStrings(result, ['address', 'network'])
  return result as OotleAccount
}

export async function getOotleBalance(): Promise<OotleBalance> {
  const result = await callOotleSigner('getOotleBalance', [])
  requireStrings(result, ['available', 'pending'])
  return result as OotleBalance
}

export async function sendOotleStealth(req: SendOotleStealthRequest): Promise<{ transactionId: string }> {
  const result = await callOotleSigner('sendOotleStealth', [req], SIGNER_SEND_TIMEOUT_MS)
  requireStrings(result, ['transactionId'])
  return result as { transactionId: string }
}

export async function waitOotleTransaction(
  transactionId: string,
  timeoutSecs: number,
): Promise<OotleTransactionResult> {
  // Universe answers by timeoutSecs; the extra minute covers its polling and the round trip.
  const result = await callOotleSigner(
    'waitOotleTransaction',
    [{ transactionId, timeoutSecs }],
    (timeoutSecs + 60) * 1000,
  )
  requireStrings(result, ['status'])
  return result as OotleTransactionResult
}
