import { X } from 'lucide-react'
import type { Tag } from '../../api/programs'

interface Props {
  tag: Tag
  onRemove?: () => void
  size?: 'sm' | 'md'
}

export default function TagBadge({ tag, onRemove, size = 'md' }: Props) {
  const padding = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold rounded-full ${padding}`}
      style={{ backgroundColor: tag.color + '18', color: tag.color, border: `1px solid ${tag.color}33` }}
    >
      {tag.name}
      {onRemove && (
        <button
          onClick={e => { e.stopPropagation(); onRemove() }}
          className="rounded-full hover:opacity-70 transition-opacity ml-0.5"
        >
          <X size={10} />
        </button>
      )}
    </span>
  )
}
