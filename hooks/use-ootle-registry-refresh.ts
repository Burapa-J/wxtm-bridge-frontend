import { useEffect } from 'react'
import { refreshOotleRegistry, useTariAccountStore } from '@/store/account'

export const OOTLE_REGISTRY_REFRESH_MS = 60_000

// Keeps the Ootle chain list current while the tapplet stays open: on an interval and whenever the
// tapplet regains focus or becomes visible.
export const useOotleRegistryRefresh = () => {
  const loaded = useTariAccountStore((s) => !!s.ootleAccount)

  useEffect(() => {
    if (!loaded) return
    const refresh = () => {
      refreshOotleRegistry().catch((error) =>
        console.error('[ TAPPLET-BRIDGE ] Could not refresh the Ootle chain registry: ', error),
      )
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    const interval = setInterval(refresh, OOTLE_REGISTRY_REFRESH_MS)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [loaded])
}
