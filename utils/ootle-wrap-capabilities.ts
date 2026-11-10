// Per-wrap read capabilities ({ paymentId, clientToken }) for this Ootle account's wraps. The backend
// only shows a wrap's amount, destination and transaction hash to a caller holding its clientToken
// (POST /ootle/wrap-token/lookup), so the token is kept after tokens-sent, separately from Universe's
// ongoing-tx slot (whose clientToken blocks new bridges).
//
// The clientToken is a secret: never log it, never put it in a URL. Only the lookup request body
// carries it.
//
// Stored in this tapplet's localStorage until Universe offers a dedicated key for it.

export type OotleWrapCapability = { paymentId: string; clientToken: string }

// Newest first; also the backend's lookup maximum.
export const MAX_OOTLE_WRAP_CAPABILITIES = 50

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_TOKEN_LENGTH = 512

function storageKey(network: string, ootleAddress: string): string {
  return `ootleWrapCapabilities:${network.toLowerCase()}:${ootleAddress}`
}

function storage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    // e.g. storage disabled for the iframe
    return undefined
  }
}

function isCapability(value: unknown): value is OotleWrapCapability {
  if (!value || typeof value !== 'object') return false
  const { paymentId, clientToken } = value as Record<string, unknown>
  return (
    typeof paymentId === 'string' &&
    UUID.test(paymentId) &&
    typeof clientToken === 'string' &&
    clientToken.length > 0 &&
    clientToken.length <= MAX_TOKEN_LENGTH
  )
}

/** This account's stored capabilities, newest first; [] when none or unreadable. */
export function loadOotleWrapCapabilities(network: string | undefined, ootleAddress: string | undefined) {
  const store = storage()
  if (!store || !network || !ootleAddress) return []
  try {
    const parsed: unknown = JSON.parse(store.getItem(storageKey(network, ootleAddress)) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(isCapability)
      .map(({ paymentId, clientToken }) => ({ paymentId, clientToken }))
      .slice(0, MAX_OOTLE_WRAP_CAPABILITIES)
  } catch {
    return []
  }
}

/** Keeps a wrap's capability for this account (newest first, capped). Failures are ignored. */
export function saveOotleWrapCapability(
  network: string | undefined,
  ootleAddress: string | undefined,
  capability: OotleWrapCapability,
): void {
  const store = storage()
  if (!store || !network || !ootleAddress || !isCapability(capability)) return
  const rest = loadOotleWrapCapabilities(network, ootleAddress).filter((c) => c.paymentId !== capability.paymentId)
  const next = [{ paymentId: capability.paymentId, clientToken: capability.clientToken }, ...rest].slice(
    0,
    MAX_OOTLE_WRAP_CAPABILITIES,
  )
  try {
    store.setItem(storageKey(network, ootleAddress), JSON.stringify(next))
  } catch {
    // quota or storage disabled: the history then shows this wrap without details
  }
}
