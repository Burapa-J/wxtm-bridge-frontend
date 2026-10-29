'use client'

import { ReactNode, useState, useEffect, useRef, useEffectEvent } from 'react'
import { WagmiProvider, State, Config, cookieToInitialState } from 'wagmi'
import { getConfig } from '@/utils/config'
import { QueryClientProvider } from '@tanstack/react-query'
import { loadOotleBridge, setTariAccount } from '@/store/account'
import { TariL1SignerParameters } from '@/types/tapplet'
import TariL1Signer from '@/clients/tari-l1-signer'
import { useIframeMessage } from '@/utils/useIframeMessage'
import useAppStore, { setAppConfig } from '@/store/app'
import useTariSignerStore, { setSigner } from '@/store/signer'
import { checkTappletHost, getInitConfig } from '@/utils/universe'
import { config as appConfig } from '@/config'
import { queryClient } from '@/app/queryClient'

export const Providers = ({ children }: { children: ReactNode }) => {
  const projectId = useAppStore((s) => s.walletConnectProjectId)
  const signer = useTariSignerStore((s) => s.signer)
  const [config, setConfig] = useState<Config | null>(null)
  const [initialState, setInitialState] = useState<State | undefined>(undefined)
  const initializedRef = useRef(false)
  const initializedSignerRef = useRef(false)

  const onInitialized = useEffectEvent((cfg: Config, state?: State) => {
    setConfig(cfg)
    if (state) {
      setInitialState(state)
    }
    initializedRef.current = true
  })

  useEffect(() => {
    if (!projectId || initializedRef.current) return
    const cfg = getConfig(projectId)

    // Get initial state only once
    const cookieHeader = document.cookie
    const state = cookieToInitialState(cfg, cookieHeader)

    onInitialized(cfg, state)
  }, [projectId])

  useEffect(() => {
    let cancelled = false
    if (initializedSignerRef.current) return

    const initializeSignerAndAccount = async () => {
      if (!signer && !cancelled) {
        // Whoever frames the tapplet answers its signer calls, so only accept Universe.
        // The dev server runs the tapplet standalone, so the check is skipped there.
        if (process.env.NODE_ENV !== 'development') {
          const host = checkTappletHost(
            window.parent !== window,
            window.location.ancestorOrigins,
            appConfig.UNIVERSE_ORIGINS,
          )
          // A host we can't verify (no ancestorOrigins) is treated as untrusted too.
          if (host !== 'trusted') {
            console.error(
              `[ TAPPLET-BRIDGE ] Not framed by a verified Tari Universe origin (${host}); the signer is disabled`,
            )
            initializedSignerRef.current = true
            return
          }
        }
        try {
          const signerParams: TariL1SignerParameters = { name: 'TariL1Signer', onConnection: setTariAccount }
          const newSigner = new TariL1Signer(signerParams)
          if (newSigner) {
            setSigner(newSigner)
            await setTariAccount()
            await setAppConfig()
            getInitConfig()
            await loadOotleBridge()
          }
        } catch (error) {
          console.error('[ TAPPLET-BRIDGE ] Failed to set Tari Account:', error)
        }
        initializedSignerRef.current = true
      }
    }

    initializeSignerAndAccount()
    return () => {
      cancelled = true
    }
  }, [signer])

  useIframeMessage()

  if (!config) {
    return <div className="h-5 w-5 animate-spin rounded-full border-b-[3px] border-white" />
  }

  return (
    <WagmiProvider config={config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}
