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
export type PanelCache = {
  at: number | null
  /** Ya salió el aviso de vencimiento para esa respuesta. */
  isAlerted: boolean
}

/** Tokens leídos del caché y entrada total de los turnos del hilo principal. */
export type PanelCacheStats = { read: number; input: number }

/** Cuándo empezó la sesión y el costo medido: total y lo que subió el último turno. */
export type PanelSession = {
  startedAt: number | null
  usd: number | null
  turnUsd: number | null
}

/** Lo que la pestaña GIT muestra del repositorio. */
export type PanelGit = {
  /** Archivos con cambios: el código de dos letras de git y la ruta. */
  files: {
    code: string
    path: string
    /** Líneas añadidas y quitadas (`git diff --numstat`); ausentes en los sin seguimiento y binarios. */
    added?: number
    removed?: number
  }[]
  /** Cuántos archivos tienen cambios en total (`files` guarda hasta 200). */
  total: number
  /** Cuántos tienen cambios en el índice, listos para el commit. */
  staged: number
  /** Cuántos tienen cambios sin pasar al índice (incluye los sin seguimiento). */
  unstaged: number
  /** Cuántos stash hay guardados. */
  stashes: number
  /** Commits por subir y por bajar; ausente si la rama no sigue a un remoto. */
  upstream?: { ahead: number; behind: number }
  /** Los commits más recientes, el último primero. */
  commits: {
    hash: string
    subject: string
    /** Cuándo se hizo, en segundos (`%ct`). */
    at?: number
    /** Falta por subir al remoto. */
    isUnpushed?: boolean
  }[]
}

/** Un servidor MCP visto en la sesión: sus herramientas hoy y las máximas que dio. */
export type PanelMcp = {
  name: string
  /** Herramientas que aporta ahora; 0 si cayó o se desconectó. */
  tools: number
  /** El mayor número de herramientas visto desde que empezó la sesión. */
  max: number
}

/** Tokens acumulados de todos los turnos (principal y subagentes). */
export type PanelTotals = { tokensIn: number; tokensOut: number }

/** Un subagente de la sesión, con sus tokens y cuánto lleva o duró. */
export type PanelAgent = {
  id: string
  /** El tipo con el que se lanzó (`Explore`, `general-purpose`...). */
  type: string
  description: string
  status: string
  tokensIn: number
  tokensOut: number
  /** Cuándo lo vio el panel por primera vez, en milisegundos del reloj del motor. */
  startedAt: number
  /** Cuándo terminó o dejó de estar en la lista en vivo; ausente mientras corre. */
  endedAt?: number
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
      /** Los servidores vistos en la sesión; vacío si nunca hubo uno. */
      mcp: Shaped<PanelMcp[]>
      tab: 'main' | 'git' | 'tasks'
      cache: Shaped<PanelCache>
      cacheStats: Shaped<PanelCacheStats>
      session: Shaped<PanelSession>
      /** La hora que el reloj del panel marcó por última vez. */
      now: number
    }
  }
}
