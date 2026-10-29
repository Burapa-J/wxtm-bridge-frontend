// 'trusted': framed by Universe. 'unverified': framed, but the browser doesn't expose ancestorOrigins.
// 'untrusted': not framed, or framed by another origin.
export function checkTappletHost(
  isFramed: boolean,
  ancestorOrigins: ArrayLike<string> | undefined,
  allowedOrigins: string[],
): 'trusted' | 'unverified' | 'untrusted' {
  if (!isFramed) return 'untrusted'
  if (!ancestorOrigins) return 'unverified'
  return ancestorOrigins.length > 0 && allowedOrigins.includes(ancestorOrigins[0]) ? 'trusted' : 'untrusted'
}

export const openExternalLink = (url: string, event: React.MouseEvent) => {
  event.preventDefault()
  window.parent.postMessage({ type: 'open-external-link', url }, '*')
}

export const sendErrorMessage = (message: string) => {
  window.parent.postMessage({ type: 'ERROR', payload: { message } }, '*')
}

export const getInitConfig = () => {
  window.parent.postMessage({ type: 'GET_INIT_CONFIG' }, '*')
}
