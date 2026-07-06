import { TAG_COLOR_CLASSES } from '@/types/tags'
import type { Tag } from '@/types/tags'

export function TagBadge({ tag, onRemove }: { tag: Tag; onRemove?: () => void }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${TAG_COLOR_CLASSES[tag.color]}`}
    >
      {tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="opacity-60 hover:opacity-100"
        >
          ×
        </button>
      )}
    </span>
  )
}
