export interface CurrentUser {
  sub: string
  email: string | null
  name: string | null
  /** Slugs de los roles del usuario en Tablerillos. Vacío ⇒ sin acceso al panel. */
  roles: string[]
}
