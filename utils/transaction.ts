import { BridgeFees } from '@/hooks/use-bridge-fees'
import { BridgeInfo } from '@/hooks/use-bridge-info'
import { OngoingUserTransaction } from '@/types/tapplet'
import { UserTransactionDTO, UserUnwrappedTransactionDTO } from '@tari-project/wxtm-bridge-backend-api'
import { utils } from 'ethers'
import i18n from 'i18next'

// A finished-but-failed bridge: a wrap that timed out, or an unwrap the backend rejected (ERROR).
export function isFailedTransaction(tx: Pick<OngoingUserTransaction, 'type' | 'status'> | undefined): boolean {
  if (!tx) return false
  return tx.type === 'wrap'
    ? tx.status === UserTransactionDTO.status.TIMEOUT
    : tx.status === UserUnwrappedTransactionDTO.status.ERROR
}

export function getTransactionAmount(tx: OngoingUserTransaction): {
  amount: string
  amountAfterFee: string
  decimals: number
} {
  if (tx.type === 'wrap') {
    return {
      amount: tx.tokenAmount,
      amountAfterFee: tx.amountAfterFee,
      decimals: 6,
    }
  } else {
    return {
      amount: tx.amount,
      amountAfterFee: tx.amountAfterFee,
      decimals: 18,
    }
  }
}

export function getWrapModalTitle(
  bridgeInfo: BridgeInfo,
  feeData: BridgeFees,
  tx?: OngoingUserTransaction,
  language?: string,
  type?: 'wrap' | 'unwrap',
): { title: string; subtext: string } {
  const t = i18n.getFixedT(language || null, 'main')

  if (!tx)
    return {
      title: t('unknown_transaction_status'),
      subtext: ``,
    }

  const { amount: tokenAmount, decimals, amountAfterFee } = getTransactionAmount(tx)
  const amountWithFee = parseFloat(utils.formatUnits(amountAfterFee, decimals).toString()).toPrecision()

  const amount = parseFloat(utils.formatUnits(tokenAmount, decimals).toString()).toPrecision()

  const bridgingTime = feeData.isOverHighBridgeThreshold ? '24-72h' : '12h'
  const fromToken = bridgeInfo.fromToken

  switch (tx.status) {
    case UserTransactionDTO.status.PENDING:
      return {
        title: t('pending_title', {
          action: type === 'wrap' ? t('wrapping') : t('unwrapping'),
          amount,
          fromToken,
        }),
        subtext: t('pending_subtext', {
          amount: amountWithFee,
          toToken: bridgeInfo.toToken,
          bridgingTime,
          direction: type === 'wrap' ? t('from') : t('to'),
        }),
      }
    case UserTransactionDTO.status.PROCESSING:
      return {
        title: t('processing_title'),
        subtext: t('processing_subtext', {
          action: type === 'wrap' ? t('wrapped') : t('unwrapped'),
        }),
      }
    case UserTransactionDTO.status.SUCCESS:
      return {
        title: t('success_title', {
          action: type === 'wrap' ? t('wrapped') : t('unwrapped'),
          amount,
          fromToken,
        }),
        subtext: t('success_subtext'),
      }
    case UserTransactionDTO.status.TIMEOUT:
      return {
        title: t('timeout_title'),
        subtext: t('timeout_subtext'),
      }
    case UserTransactionDTO.status.TOKENS_RECEIVED:
      return {
        title: t('tokens_received_title', { fromToken }),
        subtext: t('tokens_received_subtext', { fromToken }),
      }
    default:
      return {
        title: t('unknown_transaction_status'),
        subtext: ``,
      }
  }
}
