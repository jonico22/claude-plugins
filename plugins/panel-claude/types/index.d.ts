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

/** Una sesión guardada de esta carpeta, leída de su transcripción. */
export type PanelPast = {
  /** El id de la sesión: el nombre de su archivo, el que toma `claude --resume`. */
  id: string
  /** El título que Claude Code le puso; vacío si no tiene. */
  title: string
  /** Lo último que se le pidió. */
  lastPrompt?: string
  /** Cuándo se tocó por última vez, en segundos. */
  at: number
  /** Costo, duración y líneas cambiadas; ausentes si la sesión no los guardó. */
  usd?: number
  durationMs?: number
  added?: number
  removed?: number
  /** Es la sesión que está corriendo. */
  isCurrent: boolean
}

/** El resumen de una sesión, hecho con el modelo rápido. */
export type PanelSummary = {
  /** Vacío mientras se hace el primero. */
  text: string
  isLoading?: boolean
}

/** Lo que la pestaña GIT muestra del repositorio. */
export type PanelGit = {
  /** Archivos con cambios: el código de git, sus dos letras por separado y la ruta. */
  files: {
    /** El código XY sin espacios sobrantes (`M`, `MM`, `??`). */
    code: string
    /** X: estado en el índice (stage); ' ' si no hay cambio. */
    index: string
    /** Y: estado en la carpeta de trabajo; ' ' si no hay cambio. */
    worktree: string
    /** La ruta, relativa a la raíz del repo; la nueva si el archivo se renombró o copió. */
    path: string
    /** La ruta vieja de un renombrado o una copia. */
    from?: string
    /** Líneas añadidas y quitadas (`git diff --numstat`); ausentes en los sin seguimiento y binarios. */
    added?: number
    removed?: number
  }[]
  /** La raíz del repo (ruta absoluta); ausente si git no la dio. */
  root?: string
  /** Los worktrees del repo, con el actual marcado; vacío si git no los listó. */
  worktrees: {
    path: string
    branch: string
    isCurrent: boolean
    /** Archivos con cambios sin guardar; ausente si no se contó (sin carpeta, fallo o más allá del tope). */
    changes?: number
    /** Bloqueado con `git worktree lock`. */
    isLocked?: boolean
    /** Su carpeta ya no existe (el botón `Limpiar` ejecuta `git worktree prune`). */
    isPrunable?: boolean
  }[]
  /** Cuántos archivos tienen cambios en total (`files` guarda hasta 200). */
  total: number
  /** Cuántos tienen cambios en el índice, listos para el commit. */
  staged: number
  /** Cuántos tienen cambios sin pasar al índice (incluye los sin seguimiento). */
  unstaged: number
  /** Cuántos stash hay guardados en total (`stashList` guarda los primeros 8). */
  stashes: number
  /** Los stash más recientes, el último primero. */
  stashList: {
    /** Su referencia, como `stash@{0}`. */
    ref: string
    /** Cuándo se guardó, en segundos (`%ct`). */
    at?: number
    /** El mensaje limpio: `WIP · asunto` o el que puso quien lo guardó. */
    message: string
  }[]
  /** Cuántas ramas locales hay en total (`branches` guarda las primeras 8). */
  branchTotal: number
  /** Las ramas locales, la de commit más reciente primero. */
  branches: {
    name: string
    /** Cuándo fue su último commit, en segundos. */
    at?: number
    /** Es la rama que está abierta en la sesión. */
    isCurrent: boolean
    /** La rama remota que sigue; ausente si no sigue ninguna. */
    upstream?: string
    /** Commits por subir y por bajar respecto a esa remota; ausentes si está al día. */
    ahead?: number
    behind?: number
    /** Su remota ya no existe (`[gone]`). */
    isGone?: true
  }[]
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

/** El pull request de la rama actual, leído con `gh`. */
export type PanelPr = {
  number: number
  title: string
  /** `OPEN`, `CLOSED` o `MERGED`. */
  state: string
  isDraft: boolean
  url: string
  /** La decisión de revisión (`APPROVED`, `CHANGES_REQUESTED`, `REVIEW_REQUIRED`); ausente si no hay. */
  review?: string
  /** Los checks de CI reducidos a tres estados. */
  checks: { name: string; state: 'ok' | 'fail' | 'pending' }[]
}

/** El diff resumido de un archivo: sus primeras líneas y cuántas faltan. */
export type PanelDiff = {
  /** Líneas `+`, `-` y `@@` (separador); vacío si no hay vista previa. */
  lines: string[]
  /** Cuántas líneas de contenido no caben en `lines`. */
  more: number
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
      tab: 'main' | 'git' | 'tasks' | 'sessions'
      /** Las sesiones guardadas de esta carpeta; null hasta que se abre SESIONES. */
      sessions: Shaped<PanelPast[] | null>
      /** La sesión desplegada en SESIONES; null si ninguna. */
      openSession: string | null
      /** El resumen de cada sesión, por su id. */
      summaries: Shaped<Record<string, PanelSummary>>
      /** El stash desplegado en GIT, por su referencia (`stash@{0}`); null si ninguno. */
      openStash: string | null
      /** El resumen (`git stash show --stat`) de cada stash desplegado, por su referencia. */
      stashStat: Shaped<Record<string, PanelDiff>>
      /** Archivos de GIT desplegados, como `grupo:ruta` (`stage`, `unstaged`, `untracked`); el último al final. */
      expanded: Shaped<string[]>
      /** El diff resumido de cada archivo desplegado, por su clave `grupo:ruta`. */
      diffs: Shaped<Record<string, PanelDiff>>
      /** Rutas absolutas que Claude editó en esta sesión, sin repetir (hasta 200). */
      touched: Shaped<string[]>
      /** GIT muestra solo los archivos que Claude tocó. */
      onlyTouched: boolean
      /** El PR de la rama: null si no se sabe o no hay `gh`; 'none' si la rama no tiene PR. */
      pr: Shaped<PanelPr | 'none' | null>
      /** El modo de permisos de la sesión, tal como lo guarda la transcripción; null si no se sabe. */
      mode: string | null
      /** El nivel de esfuerzo de la última petición (low, medium, high...); null si no se sabe. */
      effort: string | null
      cache: Shaped<PanelCache>
      cacheStats: Shaped<PanelCacheStats>
      session: Shaped<PanelSession>
      /** La hora que el reloj del panel marcó por última vez. */
      now: number
    }
  }
}
