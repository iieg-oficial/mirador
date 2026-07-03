import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { resolveDashboardTemplate } from './utils/resolveDashboardTemplate'
import type { TemplateContext } from './utils/resolveDashboardTemplate'

interface Props {
  content: string
  context: TemplateContext
  className?: string
}

// Sin rehype-raw a propósito: el HTML crudo dentro del Markdown se muestra
// como texto plano en vez de renderizarse, así no hay HTML/JS arbitrario en
// los bloques de un tablero.
export function MarkdownItemBlock({ content, context, className = '' }: Props) {
  return (
    <div
      className={`h-full w-full overflow-auto text-sm leading-relaxed text-gray-700 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-bold [&_table]:w-full [&_td]:border [&_td]:border-gray-200 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-gray-200 [&_th]:bg-gray-50 [&_th]:px-2 [&_th]:py-1 [&_a]:text-iieg-700 [&_a]:underline ${className}`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {resolveDashboardTemplate(content, context)}
      </ReactMarkdown>
    </div>
  )
}
