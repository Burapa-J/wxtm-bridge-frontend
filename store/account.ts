import { AccountData, OngoingUserTransaction } from '@/types/tapplet'
import { create } from 'zustand'
import useTariSigner from './signer'
import { BackendBridgeTransaction, BackendUnwrapTransaction, CombinedBridgeTransaction } from '@/types/transactions'
import { BridgeTxDetails } from '@/clients/tari-l1-signer'
import { getOotleAccount, getOotleBalance, OotleAccount, OotleSignerError } from '@/clients/tari-ootle-signer'
import { OotleWrapTokenService } from '@tari-project/wxtm-bridge-backend-api'
import { getOotleAssets } from '@/utils/bridge-route'
import { setOotleConfig, setOotleUnavailable } from './bridge'
import useAppStore from './app'
import { isOotleParamsForNetwork } from '@/utils/ootle-address'

interface TariL1WalletStoreState {
  tariAccount?: AccountData
  availableBalance: number
  ongoingBridgeTx?: OngoingUserTransaction
  lastOngoingPaymentIdFromTU: string
  backendBridgeTxs: BackendBridgeTransaction[]
  backendUnwrapTxs: BackendUnwrapTransaction[]
  combinedBridgeTxs: CombinedBridgeTransaction[]
  detailedTx?: CombinedBridgeTransaction | null
  ootleAccount?: OotleAccount
  // micro TARI
  ootleAvailableBalance: number
  // An Ootle wrap whose deposit was sent but not yet confirmed with tokens-sent.
  ootleWrapToResume?: BridgeTxDetails
}

const initialState: TariL1WalletStoreState = {
  tariAccount: {
    account_id: 0,
    address: '',
  },
  availableBalance: 0,
  ongoingBridgeTx: undefined,
  lastOngoingPaymentIdFromTU: '',
  backendBridgeTxs: [],
  backendUnwrapTxs: [],
  combinedBridgeTxs: [],
  ootleAvailableBalance: 0,
}

export const useTariAccountStore = create<TariL1WalletStoreState>()(() => ({
  ...initialState,
}))

export const setTariAccount = async () => {
  if (process.env.NODE_ENV === 'development') return

  const signer = useTariSigner.getState().signer

  if (!signer) {
    console.error('[ TAPPLET-BRIDGE ] signer undefined')
    return
  }

  try {
    const account = await signer.getAccount()
    const balance = await signer.getTariBalance()
    const ongoingBridgeTx = await signer.getOngoingBridgeTx()

    useTariAccountStore.setState({
      tariAccount: {
        account_id: account.account_id,
        address: account.address,
      },
      availableBalance: balance?.available_balance || 0,
      lastOngoingPaymentIdFromTU: ongoingBridgeTx?.paymentId ?? '',
      ootleWrapToResume:
        ongoingBridgeTx?.network === 'Ootle' && ongoingBridgeTx.clientToken && ongoingBridgeTx.ootleTransactionId
          ? ongoingBridgeTx
          : undefined,
    })

    return
  } catch (error) {
    console.error('[ TAPPLET-BRIDGE ] error setting the Tari account: ', error)
  }
}

export const setLastOngoingBridgeTx = (ongoingBridgeTx: OngoingUserTransaction) =>
  useTariAccountStore.setState({ ongoingBridgeTx })

export const removeOngoingTransaction = () => {
  useTariAccountStore.setState({
    ongoingBridgeTx: undefined,
    lastOngoingPaymentIdFromTU: '',
  })
}

export const getBackendBridgeTxsFromTU = async () => {
  const signer = useTariSigner.getState().signer
  try {
    if (!signer) {
      console.error('[ TAPPLET-BRIDGE ] signer undefined')
      return []
    }
    const backendBridgeTxs = await signer.getBackendBridgeTxs()

    useTariAccountStore.setState({
      backendBridgeTxs: backendBridgeTxs,
    })
    return backendBridgeTxs
  } catch (error) {
    console.error('[ TAPPLET-BRIDGE ] error getting bridge transactions:', error)
    return []
  }
}
export const setBackendBridgeTxs = (txs: BackendBridgeTransaction[]) => {
  useTariAccountStore.setState({
    backendBridgeTxs: txs,
  })
}
export const setBackendUnwrapTxs = (txs: BackendUnwrapTransaction[]) => {
  useTariAccountStore.setState({
    backendUnwrapTxs: txs,
  })
}
export const setCombinedBridgeTxs = (wrapTxs: BackendBridgeTransaction[], unwrapTxs: BackendUnwrapTransaction[]) => {
  const combined: CombinedBridgeTransaction[] = [
    ...wrapTxs.map((tx) => ({ ...tx, type: 'wrap' as const })),
    ...unwrapTxs.map((tx) => ({ ...tx, type: 'unwrap' as const })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  useTariAccountStore.setState({
    combinedBridgeTxs: combined,
  })
}
export const setDetailedTx = (detailedTx: CombinedBridgeTransaction | null) =>
  useTariAccountStore.setState({
    detailedTx: detailedTx,
  })

export const clearOotleWrapToResume = () => useTariAccountStore.setState({ ootleWrapToResume: undefined })

export const refreshOotleBalance = async () => {
  try {
    const balance = await getOotleBalance()
    useTariAccountStore.setState({ ootleAvailableBalance: Number(balance.available) })
  } catch (error) {
    console.error('[ TAPPLET-BRIDGE ] error getting the Ootle balance: ', error)
  }
}

// Offers the Ootle routes only when the backend has a usable wTARI chain and Universe's Ootle wallet is open.
export const loadOotleBridge = async () => {
  if (process.env.NODE_ENV === 'development') return

  let assets
  let coldAccountAddress
  let ootleNetwork
  try {
    const params = await OotleWrapTokenService.getOotleWrapTokenParams()
    assets = getOotleAssets(params)
    coldAccountAddress = params.coldAccountAddress
    ootleNetwork = params.ootleNetwork
  } catch (error) {
    console.info('[ TAPPLET-BRIDGE ] Ootle bridge not available: ', error)
    return
  }
  if (!assets.length) return

  const network = useAppStore.getState().network
  if (!isOotleParamsForNetwork(ootleNetwork, coldAccountAddress, network)) {
    console.warn(
      `[ TAPPLET-BRIDGE ] Ootle params are for ${ootleNetwork}, not ${network}, or the cold account is invalid; hiding Ootle`,
    )
    return
  }

  try {
    const ootleAccount = await getOotleAccount()
    useTariAccountStore.setState({ ootleAccount })
  } catch (error) {
    if (error instanceof OotleSignerError && error.code === 'l2_unavailable') {
      setOotleUnavailable(true)
    } else {
      console.error('[ TAPPLET-BRIDGE ] error getting the Ootle account: ', error)
    }
    return
  }

  await refreshOotleBalance()
  setOotleConfig(assets, coldAccountAddress)
}
