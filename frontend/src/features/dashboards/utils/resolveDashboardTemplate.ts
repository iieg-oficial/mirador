// Sustitución de plantillas en bloques Markdown de tableros: reemplazo de
// texto puro por regex (nunca eval ni acceso dinámico a objetos JS reales),
// así que no hay superficie de inyección aunque no exista blacklist explícita.

export interface TemplateContext {
  kpi: Record<string, string>
  filter: Record<string, string>
  dashboard: Record<string, string>
}

const NAMESPACES = ['kpi', 'filter', 'dashboard'] as const
type Namespace = (typeof NAMESPACES)[number]

const PLACEHOLDER = /\{\{\s*(kpi|filter|dashboard)\.([a-zA-Z_]\w*)\s*\}\}/g

/** Reemplaza `{{ namespace.key }}` con context[namespace][key]. Cualquier cosa
 * fuera de ese patrón exacto (namespace no permitido, sin punto, etc.) se deja
 * intacta; una clave no encontrada también se deja intacta (no se borra). */
export function resolveDashboardTemplate(text: string, context: TemplateContext): string {
  return text.replace(PLACEHOLDER, (match, namespace: Namespace, key: string) => {
    const ns = context[namespace]
    // Object.hasOwn evita resolver `__proto__`/`constructor`/`prototype` contra
    // la cadena de prototipos: solo propiedades propias del contexto cuentan.
    if (!ns || !Object.hasOwn(ns, key)) return match
    return ns[key]
  })
}
