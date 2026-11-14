/** Lo que el panel muestra: una foto de la sesión, guardada en `$.state`. */
export type PanelInfo = {
  /** Carpeta de la sesión, con `~` en lugar del home. */
  cwd: string
  /** Rama de git (o commit corto si no hay rama); null fuera de un repo. */
  branch: string | null
  model: string
  /** Tokens en la ventana de contexto; ausente antes de la primera respuesta. */
  tokens?: number
  /** Tamaño de la ventana de contexto del modelo. */
  window: number
  percent?: number
  /** Costo de la sesión en dólares; ausente si no hay registro. */
  usd?: number
  /** Los límites de uso de la cuenta (5 horas, semana); vacío sin suscripción. */
  limits: PanelLimit[]
}

/** Un límite de uso: qué ventana, cuánto va usado y cuándo se reinicia. */
export type PanelLimit = {
  kind: string
  percentUsed: number
  /** Momento del reinicio, en milisegundos; ausente si no se sabe. */
  resetsAt?: number
}

/** Cuándo llegó la última respuesta del modelo: de ahí se estima el caché. */
export type PanelCache = { at: number | null }

/** Lo que la pestaña GIT muestra del repositorio. */
export type PanelGit = {
  /** Archivos con cambios: el código de dos letras de git y la ruta. */
  files: { code: string; path: string }[]
  /** Los commits más recientes, el último primero. */
  commits: { hash: string; subject: string }[]
}

/** Tokens acumulados de todos los turnos (principal y subagentes). */
export type PanelTotals = { tokensIn: number; tokensOut: number }

/** Un subagente de la sesión, con los tokens que lleva gastados. */
export type PanelAgent = {
  id: string
  /** El tipo con el que se lanzó (`Explore`, `general-purpose`...). */
  type: string
  description: string
  status: string
  tokensIn: number
  tokensOut: number
}

/** Una tarea de la lista de Claude. */
export type PanelTodo = {
  id: string
  text: string
  status: 'pending' | 'in_progress' | 'completed'
}

declare module 'claude-code' {
  interface PluginState {
    'panel-claude': {
      info: Shaped<PanelInfo | null>
      totals: Shaped<PanelTotals>
      agents: Shaped<PanelAgent[]>
      todos: Shaped<PanelTodo[]>
      /** null fuera de un repositorio. */
      git: Shaped<PanelGit | null>
      tab: 'main' | 'git'
      cache: Shaped<PanelCache>
      /** La hora que el reloj del panel marcó por última vez. */
      now: number
    }
  }
}
