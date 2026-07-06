import { useQuery } from '@tanstack/react-query'
import { listTags } from './api'
import { TAG_COLOR_CLASSES } from '@/types/tags'

interface Props {
  value: string[]
  onChange: (tagIds: string[]) => void
}

// Chips clicables (toggle, AND): filtran la lista por entidades que tengan
// TODAS las etiquetas seleccionadas (mismo criterio que el backend).
export function TagFilterBar({ value, onChange }: Props) {
  const { data: tags = [] } = useQuery({ queryKey: ['tags'], queryFn: listTags })

  if (tags.length === 0) return null

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => {
        const active = value.includes(tag.id)
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => toggle(tag.id)}
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition-opacity ${TAG_COLOR_CLASSES[tag.color]} ${
              active ? '' : 'opacity-40 hover:opacity-70'
            }`}
          >
            {tag.name}
          </button>
        )
      })}
    </div>
  )
}
