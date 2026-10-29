import { create } from 'zustand'
import useTariSigner from './signer'
import { EthereumNodesService, OpenAPI, PublicEthereumNodeRespDTO } from '@tari-project/wxtm-bridge-backend-api'
import i18next, { changeLanguage } from 'i18next'
import { parseTheme, Theme } from '@/types/app'
import { SupportedChain, supportedChains } from '@/utils/networksConfig'

const ETHEREUM_NODES_FETCH_TIMEOUT_MS = 5000

interface State {
  language: string
  walletConnectProjectId: string
  bridgeAPI: string
  theme: Theme
  hideWalletBalance: boolean
  isMainNet: boolean
  // Universe network name from getNetwork(), e.g. 'mainnet' or 'esmeralda'
  network: string
  ethereumNodes: PublicEthereumNodeRespDTO[]
}

interface Actions {
  getSupportedChains: () => SupportedChain[]
}

type AppStoreState = State & Actions

const initialState: State = {
  language: 'en',
  walletConnectProjectId: '',
  bridgeAPI: '',
  theme: 'light',
  hideWalletBalance: false,
  isMainNet: true,
  network: '',
  ethereumNodes: [],
}

// Fetch the backend-served public RPC nodes. Times out and falls back to an
// empty list so a slow/unreachable backend never blocks app startup; viem's
// default transports are used for any chain without configured nodes.
const fetchEthereumNodes = async (): Promise<PublicEthereumNodeRespDTO[]> => {
  const request = EthereumNodesService.getPublicNodes()
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      if (typeof request.cancel === 'function') {
        request.cancel()
      }
      reject(new Error('Timed out fetching public ethereum nodes'))
    }, ETHEREUM_NODES_FETCH_TIMEOUT_MS)
  })

  try {
    const nodes = await Promise.race([request, timeout])
    console.info('[ TAPPLET-BRIDGE ] loaded public ethereum nodes ', nodes)
    return nodes
  } catch (error) {
    console.error('[ TAPPLET-BRIDGE ] failed to fetch public ethereum nodes ', error)
    return []
  } finally {
    clearTimeout(timeoutId)
  }
}

const useAppStore = create<AppStoreState>()((_, get) => ({
  ...initialState,
  getSupportedChains: () => {
    const isMainNet = get().isMainNet
    return isMainNet ? supportedChains.filter((c) => c.id === 1) : supportedChains.filter((c) => c.id !== 1)
  },
}))

export const setAppConfig = async () => {
  const signer = useTariSigner.getState().signer

  try {
    if (!signer) {
      console.error('[ TAPPLET-BRIDGE ] signer undefined')
      return
    }

    const network = await signer.getNetwork()
    const isMainNet = network?.toLowerCase() === 'mainnet'

    const envs =
      process.env.NODE_ENV === 'development'
        ? [process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID, process.env.NEXT_PUBLIC_BACKEND_API_URL]
        : await signer.getBridgeEnvs()

    const walletConnectProjectId = envs?.[0] ?? ''
    const bridgeAPI = envs?.[1] ?? ''

    // set OpenAPI configuration before fetching the public ethereum nodes
    OpenAPI.BASE = bridgeAPI

    // Fetch nodes before exposing walletConnectProjectId: setting it triggers the
    // wagmi config build in Providers, which reads ethereumNodes from this store.
    const ethereumNodes = await fetchEthereumNodes()
    useAppStore.setState({ walletConnectProjectId, bridgeAPI, isMainNet, network: network ?? '', ethereumNodes })

    const appLanguage = await signer.getAppLanguage()
    if (appLanguage) await setLanguage(appLanguage)

    return walletConnectProjectId
  } catch (error) {
    console.error('[ TAPPLET-BRIDGE ] error setting the Bridge app config ', error)
  }
}

export const setLanguage = async (languageCode: string) => {
  try {
    if (i18next.language !== languageCode) {
      useAppStore.setState({
        language: languageCode,
      })
      console.info(`Changing current language ${i18next.language} to ${languageCode}`)
      await changeLanguage(languageCode)
    }
  } catch (e) {
    console.error('Could not set language:', e)
  }
}

export const setTheme = (theme: string) => {
  const parsedTheme = parseTheme(theme)
  console.info(`Changing theme to ${parsedTheme}`)
  useAppStore.setState({
    theme: parsedTheme,
  })
}

export default useAppStore
