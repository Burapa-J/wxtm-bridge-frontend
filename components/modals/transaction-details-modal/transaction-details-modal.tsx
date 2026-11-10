import { FailedModal } from '@/components/modals/failed-modal'
import { SuccessModal } from '@/components/modals/success-modal'
import { WrapModal } from '@/components/modals/wrap-modal'
import { getStatusInfo } from '@/components/transactions/helpers'
import { config } from '@/config'
import { BridgeFees } from '@/hooks/use-bridge-fees'
import { getTransactionAmount, isOverHighBridgeThreshold } from '@/utils/transaction'
import { getTransactionAsset } from '@/utils/bridge-route'
import { useBridgeRoute } from '@/hooks/use-bridge-route'
import { memo, useRef } from 'react'
import { TransactionDetailsModalProps } from './transaction-details-modal.types'

const TransactionDetailsModal = memo(function TransactionDetailsModal({
  transaction,
  closeModalAction,
}: TransactionDetailsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const { assets } = useBridgeRoute()
  const asset = getTransactionAsset(transaction.ootleChainId, assets)
  const statusInfo = getStatusInfo(transaction.status)
  const { amount: tokenAmount, decimals } = getTransactionAmount(transaction)
  const highThreshold = asset?.highThreshold ?? config.HIGH_BRIDGE_THRESHOLD

  const feesData: BridgeFees = {
    feeAmount: transaction.feeAmount,
    amountAfterFee: transaction.amountAfterFee,
    feePercentage: 50,
    isOverHighBridgeThreshold: isOverHighBridgeThreshold(tokenAmount, decimals, highThreshold),
  }

  const renderModal = () => {
    switch (statusInfo.statusType) {
      case 'pending':
        return (
          <WrapModal
            closeModalAction={closeModalAction}
            feesData={feesData}
            tariWalletAddress={transaction.sourceAddress}
            ethereumAddress={transaction.destinationAddress}
            amountAfterFee={transaction.amountAfterFee}
            destinationAddress={transaction.destinationAddress}
            transactionStatus={transaction}
            type={transaction.type}
            asset={asset}
            ootleChainId={transaction.ootleChainId}
          />
        )

      case 'completed':
        return (
          <SuccessModal
            closeModalAction={closeModalAction}
            amount={tokenAmount}
            tariWalletAddress={transaction.sourceAddress}
            ethereumAddress={transaction.destinationAddress}
            detailedTx={transaction}
            type={transaction.type}
            asset={asset}
            ootleChainId={transaction.ootleChainId}
          />
        )

      case 'timeout':
      // a rejected unwrap
      case 'error':
        return (
          <FailedModal
            closeModalAction={closeModalAction}
            paymentId={transaction.paymentId}
            fromHistory
            asset={asset}
            ootleChainId={transaction.ootleChainId}
          />
        )

      default:
        return <></>
    }
  }

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50">
      <section
        ref={modalRef}
        className="w-full max-w-md mx-4 bg-[#E0DFDE] shadow-[0px_4px_74px_0px_rgba(0,0,0,0.15)] backdrop-blur-[54px] rounded-3xl overflow-hidden flex flex-col justify-center items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {renderModal()}
      </section>
    </div>
  )
})

export { TransactionDetailsModal }
