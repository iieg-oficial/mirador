/**
 * Pantalla para fallos del flujo de login que NO son "sin rol": estado OIDC
 * expirado, error al canjear el código con Minerva, parámetros de callback
 * inválidos. El backend redirige aquí con ?error=auth_failed en vez de responder
 * JSON crudo. A diferencia de AccessDenied, aquí reintentar SÍ puede resolver, así
 * que se ofrece volver a iniciar sesión.
 */
export function AuthError() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6 text-center">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-iieg-100">
          <svg className="h-7 w-7 text-iieg-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
        </div>

        <h1 className="text-lg font-semibold text-gray-900">No se pudo iniciar sesión</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          Hubo un problema al completar el inicio de sesión con Minerva. Es posible que la
          sesión haya expirado. Intenta de nuevo; si el problema persiste, contacta al
          administrador.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <a
            href="/api/auth/login"
            className="rounded-md bg-iieg-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-iieg-600"
          >
            Volver a iniciar sesión
          </a>
          <a
            href="/"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-900"
          >
            Volver al inicio
          </a>
        </div>
      </div>
    </div>
  )
}
