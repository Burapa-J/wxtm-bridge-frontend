import { useMemo } from 'react'
import { utils } from 'ethers'

import { BridgeFees } from './use-bridge-fees.types'

export const useBridgeFees = (
  tokenAmount: string,
  tokenDecimals: number,
  feeBps: number,
  highBridgeThreshold: number,
): BridgeFees => {
  return useMemo(() => {
    try {
      if (!tokenAmount || tokenAmount.trim() === '') {
        return {
          feeAmount: '0',
          amountAfterFee: '0',
          feePercentage: 0,
          isOverHighBridgeThreshold: false,
        }
      }
      const amount = utils.parseUnits(tokenAmount, tokenDecimals)
      const parsedThreshold = utils.parseUnits(highBridgeThreshold.toString(), tokenDecimals)

      const isOverHighBridgeThreshold = amount.gt(parsedThreshold)

      const feeAmountBN = amount.mul(feeBps).div(10000)
      const amountAfterFeeBN = amount.sub(feeAmountBN)

      return {
        feeAmount: utils.formatUnits(feeAmountBN, tokenDecimals).toString(),
        amountAfterFee: utils.formatUnits(amountAfterFeeBN, tokenDecimals).toString(),
        feePercentage: feeBps / 100,
        isOverHighBridgeThreshold,
      }
    } catch (error) {
      console.error('Could not estimate ETH fees: ', error)

      return {
        feeAmount: '0',
        amountAfterFee: '0',
        feePercentage: 0,
        isOverHighBridgeThreshold: false,
      }
    }
  }, [tokenAmount, tokenDecimals, feeBps, highBridgeThreshold])
}
