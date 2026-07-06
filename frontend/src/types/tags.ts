export type TagColor = 'purple' | 'orange' | 'blue' | 'green' | 'red' | 'amber' | 'teal' | 'gray'

export const TAG_COLORS: TagColor[] = [
  'purple',
  'orange',
  'blue',
  'green',
  'red',
  'amber',
  'teal',
  'gray',
]

// Preset fijo (no color libre): con decenas de tags, un set acotado mantiene
// los badges legibles. Clases de Tailwind ya disponibles sin tocar el theme.
export const TAG_COLOR_CLASSES: Record<TagColor, string> = {
  purple: 'bg-purple-100 text-purple-700',
  orange: 'bg-orange-100 text-orange-700',
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  red: 'bg-red-100 text-red-700',
  amber: 'bg-amber-100 text-amber-700',
  teal: 'bg-teal-100 text-teal-700',
  gray: 'bg-gray-100 text-gray-700',
}

export interface Tag {
  id: string
  name: string
  color: TagColor
  created_at: string
}

export interface TagCreate {
  name: string
  color: TagColor
}

export interface TagUpdate {
  name?: string
  color?: TagColor
}
