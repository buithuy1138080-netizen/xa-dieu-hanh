import { useEffect } from 'react'

/** Call `callback` when the Escape key is pressed. */
export function useEscapeKey(callback: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') callback()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [callback, enabled])
}
