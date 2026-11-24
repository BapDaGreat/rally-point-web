import { useEffect } from 'react'

export const SITE_NAME = 'bRineLy'

/** "Find a court · bRineLy": the page first, so tabs and history stay readable. */
export function documentTitle(title?: string) {
  const page = title?.trim()
  return page && page !== SITE_NAME ? `${page} · ${SITE_NAME}` : SITE_NAME
}

/** Names the browser tab after the page, and puts the previous name back when the page goes. */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    const previous = document.title
    document.title = documentTitle(title)
    return () => {
      document.title = previous
    }
  }, [title])
}
