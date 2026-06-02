import { useCallback } from 'react'
import { useEscapeKey } from '../../hooks/useEscapeKey'

interface Props {
  onClose: () => void
  children: React.ReactNode
  /** Max width class, e.g. "max-w-lg" (default: max-w-2xl) */
  maxWidth?: string
  /** Whether pressing ESC is disabled (e.g. during save) */
  disableEsc?: boolean
}

/**
 * Reusable modal wrapper with:
 *  - backdrop click to close
 *  - ESC key to close
 *  - responsive max-height with scroll
 */
export default function Modal({ onClose, children, maxWidth = 'max-w-2xl', disableEsc = false }: Props) {
  useEscapeKey(useCallback(() => onClose(), [onClose]), !disableEsc)

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 md:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${maxWidth} max-h-[92vh] flex flex-col overflow-hidden`}>
        {children}
      </div>
    </div>
  )
}
