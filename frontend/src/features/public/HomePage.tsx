import type { ReactNode } from 'react'

interface Feature {
  title: string
  description: string
  icon: ReactNode
}

const FEATURES: Feature[] = [
  {
    title: 'Datos oficiales',
    description:
      'Información producida y verificada por el Instituto de Información Estadística y Geográfica de Jalisco.',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    ),
  },
  {
    title: 'Visualización interactiva',
    description:
      'Gráficas y mapas que permiten explorar indicadores municipales desde distintas perspectivas.',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
      />
    ),
  },
  {
    title: 'Actualización continua',
    description:
      'Los tableros se actualizan conforme se incorporan nuevos datos al sistema de información municipal.',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    ),
  },
]

export function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-iieg-950 via-iieg-900 to-iieg-800 text-white">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="max-w-2xl">
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/50">
              Business Intelligence Municipal
            </p>
            <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
              Datos municipales
              <br />
              de Jalisco
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-white/75">
              Visualizaciones interactivas sobre indicadores estadísticos y geográficos de
              los&nbsp;125 municipios de Jalisco, producidas por el IIEG.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <a
                href="#tableros"
                className="rounded-lg bg-white px-6 py-3 text-sm font-semibold text-iieg-900 transition-colors hover:bg-white/90"
              >
                Ver tableros
              </a>
              <a
                href="https://datos.iieg.gob.mx"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-white/25 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Portal de datos ↗
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Cifras rápidas */}
      <section className="bg-iieg-800 text-white">
        <div className="mx-auto max-w-7xl px-6 py-5">
          <div className="grid grid-cols-3 divide-x divide-white/15 text-center">
            <div className="px-4">
              <p className="text-2xl font-bold">125</p>
              <p className="mt-0.5 text-xs text-white/50">Municipios</p>
            </div>
            <div className="px-4">
              <p className="text-2xl font-bold text-white/30">—</p>
              <p className="mt-0.5 text-xs text-white/50">Tableros publicados</p>
            </div>
            <div className="px-4">
              <p className="text-2xl font-bold text-white/30">—</p>
              <p className="mt-0.5 text-xs text-white/50">Indicadores</p>
            </div>
          </div>
        </div>
      </section>

      {/* Tableros publicados */}
      <section id="tableros" className="bg-gray-50 py-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-10">
            <h2 className="text-2xl font-bold text-gray-900">Tableros publicados</h2>
            <p className="mt-2 text-gray-500">
              Visualizaciones disponibles para consulta pública.
            </p>
          </div>

          {/* Estado vacío */}
          <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white py-20 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-iieg-900/8">
              <svg
                className="h-7 w-7 text-iieg-700"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
                />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-gray-800">
              Sin tableros publicados aún
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              Los tableros aparecerán aquí cuando sean publicados por el equipo del IIEG.
            </p>
          </div>
        </div>
      </section>

      {/* Características */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {FEATURES.map(({ title, description, icon }) => (
              <div
                key={title}
                className="rounded-xl border border-gray-100 bg-gray-50 p-6"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-iieg-900/8">
                  <svg
                    className="h-5 w-5 text-iieg-700"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    {icon}
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
