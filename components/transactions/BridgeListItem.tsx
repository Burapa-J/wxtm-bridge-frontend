import { memo, useRef, useState, useEffect } from 'react'
import { BridgeBaseItemProps, BridgeHistoryListItemProps } from '@/types/transactions'
import {
  BlockInfoWrapper,
  Chip,
  Content,
  ContentWrapper,
  CurrencyText,
  ItemWrapper,
  StatusContent,
  StatusWrapper,
  TimeWrapper,
  TitleWrapper,
  ValueChangeWrapper,
  ValueWrapper,
} from './ListItem.styles'
import { useTranslation } from 'react-i18next'
import { formatNumber, FormatPreset } from '@/utils/formatters'
import { formatTimeStamp, getTimestampFromTransaction, getStatusInfo } from './helpers'
import { getTransactionAmount } from '@/utils/transaction'

import { truncateMiddle } from '@/utils/truncateString'
import useAppStore from '@/store/app'
import { BsQuestionCircleFill } from 'react-icons/bs'
import { openExternalLink } from '@/utils/universe'
import { HiArrowRightOnRectangle } from 'react-icons/hi2'
import { UserTransactionDTO, UserUnwrappedTransactionDTO } from '@tari-project/wxtm-bridge-backend-api'
import { buildEtherscanLink } from '@/utils/tariNetwork'
import { useBridgeStore } from '@/store/bridge'
import { getExplorerUrl } from '@/utils/bridge-route'
import { KNOWN_EVM_CHAINS } from '@/utils/evm-chains'

const BaseItem = memo(function BaseItem({
  title,
  time,
  value,
  chip,
  onClick,
  status,
  transactionType,
  currency,
}: BridgeBaseItemProps) {
  // note re. isPositiveValue:
  // amounts in the tx response are always positive numbers but
  // if the transaction is Outbound, the value is negative

  const displayTitle = title.length > 26 ? truncateMiddle(title, 8) : title
  return (
    <ContentWrapper onClick={onClick}>
      <Content>
        <BlockInfoWrapper>
          <TitleWrapper
            title={title}
            style={{
              color: transactionType === 'wrap' ? '#000' : '#000',
            }}
          >
            {displayTitle}
          </TitleWrapper>
          <TimeWrapper variant="p">{time}</TimeWrapper>
        </BlockInfoWrapper>
      </Content>

      <BlockInfoWrapper>
        <Content>
          <div className="mr-1">
            {chip ? (
              <Chip>
                <span>{chip}</span>
              </Chip>
            ) : null}
          </div>

          <ValueWrapper>
            {transactionType === 'wrap' && <ValueChangeWrapper $isPositiveValue={false}>{`-`}</ValueChangeWrapper>}
            {transactionType === 'unwrap' && <ValueChangeWrapper $isPositiveValue={true}>{`+`}</ValueChangeWrapper>}
            {value}
            <CurrencyText>{currency}</CurrencyText>
          </ValueWrapper>
        </Content>
        <div className="flex justify-end">
          <StatusWrapper $status={getStatusInfo(status).statusType}>
            <StatusContent>{getStatusInfo(status).text}</StatusContent>
          </StatusWrapper>
        </div>
      </BlockInfoWrapper>
    </ContentWrapper>
  )
})

const AnimatedDots = memo(function AnimatedDots() {
  const [dotCount, setDotCount] = useState(1)

  useEffect(() => {
    const interval = setInterval(() => {
      setDotCount((prev) => (prev >= 3 ? 1 : prev + 1))
    }, 700)
    return () => clearInterval(interval)
  }, [])

  return <span>{'.'.repeat(dotCount)}</span>
})

const HistoryBaseItem = memo(function HistoryBaseItem({
  title,
  time,
  value,
  onClick,
  status,
  address,
  transactionHash,
  transactionType,
  badge,
  currency,
  explorerUrl,
}: BridgeBaseItemProps) {
  const { t } = useTranslation('main', { useSuspense: false })
  const displayTitle = title.length > 26 ? truncateMiddle(title, 8) : title
  const displayAddress = address ? truncateMiddle(address, 6) : ''
  const etherscanLink = buildEtherscanLink(transactionHash, explorerUrl)

  const renderExplorerSection = () => {
    if (
      transactionType === 'unwrap' ||
      status === UserTransactionDTO.status.SUCCESS ||
      status === UserUnwrappedTransactionDTO.status.SUCCESS
    ) {
      return (
        <button className="flex flex-[1] p-3 hover:cursor-pointer">
          <a
            onClick={(e) => openExternalLink(etherscanLink, e)}
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center underline"
          >
            {t('view_on_block_explorer')}
            <HiArrowRightOnRectangle className="ml-2 text-sm" />
          </a>
        </button>
      )
    }

    // Show loading dots only for pending wrap transactions
    // (unwrap transactions always show explorer link above)
    if (
      transactionType === 'wrap' &&
      (status === UserTransactionDTO.status.PENDING ||
        status === UserTransactionDTO.status.PROCESSING ||
        status === UserTransactionDTO.status.TOKENS_RECEIVED)
    ) {
      return (
        <div className="flex flex-[1] p-3">
          <div className="flex-1 flex items-center justify-center">
            <AnimatedDots />
          </div>
        </div>
      )
    }

    return (
      <div className="flex flex-[1] p-3">
        <div className="flex-1 flex items-center justify-center"></div>
      </div>
    )
  }

  return (
    <div className="w-full px-3 flex flex-row items-center h-full text-xs font-[520]">
      <button className="flex flex-[3] p-3 hover:cursor-pointer" onClick={onClick}>
        <div className="flex-1 flex items-center">
          <TitleWrapper
            title={title}
            style={{
              color: transactionType === 'wrap' ? '#000' : '#000',
            }}
          >
            {displayTitle}
          </TitleWrapper>
          {badge ? <span className="ml-2 text-[10px] text-gray-500 whitespace-nowrap">{badge}</span> : null}
        </div>

        <div className="flex-1 flex items-center justify-center">
          <TimeWrapper variant="p">{time}</TimeWrapper>
        </div>

        <div className="flex-1 flex items-center justify-center">
          <ValueWrapper>
            {transactionType === 'wrap' && <ValueChangeWrapper $isPositiveValue={false}>{`-`}</ValueChangeWrapper>}
            {transactionType === 'unwrap' && <ValueChangeWrapper $isPositiveValue={true}>{`+`}</ValueChangeWrapper>}
            {value}
            <CurrencyText>{currency}</CurrencyText>
          </ValueWrapper>
        </div>

        <div className="flex-1 flex items-center justify-center">{displayAddress}</div>

        <div className="flex-1 flex items-center justify-center">
          <StatusWrapper $status={getStatusInfo(status).statusType}>
            {getStatusInfo(status).showIcon ? (
              <StatusContent>
                <span>{getStatusInfo(status).text}</span>
                <BsQuestionCircleFill size={12} />
              </StatusContent>
            ) : (
              getStatusInfo(status).text
            )}
          </StatusWrapper>
        </div>
      </button>

      {renderExplorerSection()}
    </div>
  )
})

const BridgeHistoryListItem = memo(function ListItem({
  item,
  index,
  itemIsNew = false,
  setDetailedTx,
  isHistoryList = false,
}: BridgeHistoryListItemProps & { isHistoryList?: boolean }) {
  const { t } = useTranslation()
  const hideWalletBalance = useAppStore((s) => s.hideWalletBalance)
  const ootleAssets = useBridgeStore((s) => s.ootleAssets)

  const ref = useRef<HTMLDivElement>(null)

  // An Ootle wrap listed without its lookup details shows chain, time and status only.
  const detailsHidden = item.type === 'wrap' && item.detailsHidden === true
  const { amount: tokenAmount, decimals } = getTransactionAmount(item)
  // Convert to XTM base units (6 decimals) for consistent formatting
  const normalizedAmount = (Number(tokenAmount) / Math.pow(10, decimals)) * Math.pow(10, 6)
  const earningsFormatted = detailsHidden
    ? '—'
    : hideWalletBalance
      ? `***`
      : formatNumber(normalizedAmount, FormatPreset.XTM_COMPACT).toLowerCase()
  const time = formatTimeStamp(getTimestampFromTransaction(item))

  const ootleChainId = item.ootleChainId
  let tariToken = 'XTM'
  let evmToken = 'wXTM'
  let chainName = 'Ethereum'
  let explorerUrl: string | undefined
  if (ootleChainId !== undefined) {
    const ootleAsset = ootleAssets.find((a) => a.chainId === ootleChainId)
    tariToken = 'TARI'
    evmToken = 'wTARI'
    chainName = ootleAsset?.chainName ?? KNOWN_EVM_CHAINS[ootleChainId]?.name ?? String(ootleChainId)
    explorerUrl = ootleAsset?.explorerUrl ?? getExplorerUrl(ootleChainId)
  }

  const transactionTitle =
    item.type === 'wrap' ? `Bridge ${tariToken} to ${evmToken}` : `Bridge ${evmToken} to ${tariToken}`

  const handleItemClick = () => {
    const detailedTx = { ...item, createdAt: time }
    setDetailedTx?.(detailedTx)
  }

  const baseItem = isHistoryList ? (
    <HistoryBaseItem
      title={transactionTitle}
      time={time}
      value={earningsFormatted}
      status={item?.status}
      address={detailsHidden ? undefined : item?.sourceAddress || item?.destinationAddress}
      transactionHash={item?.transactionHash}
      onClick={detailsHidden ? undefined : handleItemClick}
      transactionType={item.type}
      badge={`${evmToken} · ${chainName}`}
      currency={tariToken}
      explorerUrl={explorerUrl}
    />
  ) : (
    <BaseItem
      title={transactionTitle}
      time={time}
      value={earningsFormatted}
      status={item?.status}
      chip={itemIsNew ? t('new') : ''}
      onClick={detailsHidden ? undefined : handleItemClick}
      transactionType={item.type}
      currency={tariToken}
    />
  )

  return (
    <ItemWrapper ref={ref} data-index={index} style={{ height: 48 }}>
      {baseItem}
    </ItemWrapper>
  )
})

export { BridgeHistoryListItem }
