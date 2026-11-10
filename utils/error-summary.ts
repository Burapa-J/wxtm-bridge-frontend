import { ApiError } from '@tari-project/wxtm-bridge-backend-api'

// A log-safe description: an ApiError carries the request body, which can hold the Ootle clientToken.
export function errorSummary(error: unknown): string {
  if (error instanceof ApiError) {
    return `${error.status} ${error.message}: ${error.body?.message ?? ''}`
  }
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}
