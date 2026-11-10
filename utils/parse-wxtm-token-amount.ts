import { config } from '@/config'
import { utils } from 'ethers'

export function parseWxtmTokenAmount(amount: string): string {
  if (amount.split('.')[1] && amount.split('.')[1][0].length > 6) {
    throw new Error('Invalid amount: more than 6 decimal places')
  }

  const sanitizedAmount = amount.replace(/,/g, '')

  const parsed = utils.parseUnits(sanitizedAmount, 6)
  return parsed.toString()
}

export function parseToMaxAllowed(
  input: string,
  maxValue = config.MAX_BRIDGE_AMOUNT,
  maxDecimals: number = 6,
): number {
  const cleaned = input.replace(/,/g, '')
  let num = Number(cleaned)

  if (isNaN(num)) {
    throw new Error(`Invalid number input: ${input}`)
  }

  // Round to maxDecimals decimal places
  const factor = Math.pow(10, maxDecimals)
  num = Math.round(num * factor) / factor

  // Cap to maxValue
  if (num > maxValue) {
    num = maxValue
  }

  return num
}

// Compared in micro units, so a remaining limit of 0 (or under 1 XTM) still blocks.
export function isOverDailyLimit(amount: string, limitMicro: string): boolean {
  return BigInt(parseWxtmTokenAmount(amount)) > BigInt(limitMicro)
}

export const microXtmToXtm = (microXtm: string | bigint): number => {
  return Number(BigInt(microXtm) / BigInt(config.MICRO_XTM_PER_XTM))
}
