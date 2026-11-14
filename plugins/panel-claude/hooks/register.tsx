import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionUsage } from 'claude-code'

import type {
  PanelAgent,
  PanelCacheStats,
  PanelGit,
  PanelInfo,
  PanelLimit,
  PanelMcp,
  PanelSession,
  PanelTodo,
  PanelTotals,
} from '../types'

const PANE = 'panel-claude'
const TITLE = 'Panel'
// Qué parte del ancho del terminal pide el panel acoplado. Si arrastras el
// borde del panel para cambiarle el tamaño, gana tu tamaño.
const SHARE = 0.25
// Ancho pedido al iniciar, cuando todavía no se conoce el ancho del terminal;
// `/panel` lo ajusta al 25 % exacto.
const START_COLUMNS = 36

// Cambia la etiqueta `shape` cuando cambien los campos: así el código nuevo
// descarta lo que una versión anterior guardó (el estado sobrevive a una recarga).
const info = atom({ plugin: 'panel-claude', key: 'info' } as const, null, {
  shape: 'info-2',
})
const totals = atom(
  { plugin: 'panel-claude', key: 'totals' } as const,
  { tokensIn: 0, tokensOut: 0 },
  { shape: 'totals-1' },
)

const agents = atom({ plugin: 'panel-claude', key: 'agents' } as const, [], {
  shape: 'agents-1',
})
const todos = atom({ plugin: 'panel-claude', key: 'todos' } as const, [], {
  shape: 'todos-1',
})

// Cuándo llegó la última respuesta: el caché del prompt dura desde ahí.
// `isAlerted` guarda que el aviso de vencimiento ya salió para esa respuesta.
const cache = atom(
  { plugin: 'panel-claude', key: 'cache' } as const,
  { at: null, isAlerted: false },
  { shape: 'cache-2' },
)
// Lo leído del caché frente a toda la entrada de los turnos del hilo principal.
const cacheStats = atom(
  { plugin: 'panel-claude', key: 'cacheStats' } as const,
  { read: 0, input: 0 },
  { shape: 'cacheStats-1' },
)
// Desde cuándo corre la sesión y el costo: total medido y lo que subió en el último turno.
const session = atom(
  { plugin: 'panel-claude', key: 'session' } as const,
  { startedAt: null, usd: null, turnUsd: null },
  { shape: 'session-1' },
)
// La hora del reloj del panel; cada cambio redibuja las cuentas regresivas.
const clock = atom({ plugin: 'panel-claude', key: 'now' } as const, 0)

const git = atom({ plugin: 'panel-claude', key: 'git' } as const, null, {
  shape: 'git-3',
})
// Los servidores MCP que aportan herramientas a la sesión.
const mcp = atom({ plugin: 'panel-claude', key: 'mcp' } as const, [], {
  shape: 'mcp-1',
})
const tab = atom({ plugin: 'panel-claude', key: 'tab' } as const, 'main')

// El color del marco y los títulos; se elige en /config.
const ACCENTS: Record<string, string> = {
  celeste: '#4aa8ff',
  morado: '#c084fc',
  naranja: 'claude',
  verde: '#4ade80',
  azul: '#60a5fa',
}
// Los emuladores de terminal donde se puede abrir lazygit, en orden de
// preferencia, y cómo recibe cada uno el comando (casi todos con `-e`).
const TERMINALS = [
  'ghostty',
  'kitty',
  'wezterm',
  'alacritty',
  'foot',
  'gnome-terminal',
  'konsole',
  'xterm',
  'x-terminal-emulator',
]
const TERMINAL_ARGS: Record<string, string[]> = {
  wezterm: ['start', '--'],
  'gnome-terminal': ['--'],
}
const MAX_FILES = 12
// En MAIN la lista de cambios es más corta: comparte el panel con todo lo demás.
const MAX_MAIN_FILES = 6
const MAX_MCP = 8
const MAX_COMMITS = 6
const TICK_MS = 5000
// Cuánto antes de que venza el caché avisa el toast: 1 min si dura 5 min, 5 min si dura 1 h.
const ALERT_SHORT_MS = 60_000
const ALERT_LONG_MS = 300_000
// Desde qué porcentaje leído del caché la fila pasa a verde y a naranja.
const READ_GOOD = 70
const READ_FAIR = 30
// Tras una herramienta que toca archivos, git se relee como mucho una vez por
// este tiempo.
const REREAD_MS = 1000
const MAX_AGENTS = 6
const MAX_TODOS = 12
const ENDED = new Set(['completed', 'failed', 'killed'])

/** 199300 -> "199k", 32200000 -> "32.2M". */
const compact = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`

  return String(n)
}

/** 275000 ms -> "4:35"; desde una hora, "1h 05m"; desde un día, "2d 3h". */
/** Lo que dura el caché del prompt si nada dice otra cosa. */
const DEFAULT_CACHE_MS = 300_000

/** "5m" o "1h" en milisegundos; cualquier otro valor no dice nada. */
const ttlMs = (value: unknown): number | undefined =>
  value === '1h' ? 3_600_000 : value === '5m' ? DEFAULT_CACHE_MS : undefined

const countdown = (ms: number): string => {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`
  if (hours >= 1) return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`

  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

const LIMIT_NAMES: Record<string, string> = {
  five_hour: '5 horas',
  seven_day: 'Semana',
  spend_limit: 'Gasto',
}
// Los límites que llevan barra de progreso debajo de su fila.
const LIMITS_WITH_BAR = new Set(['five_hour', 'seven_day'])
// Desde qué porcentaje un límite pasa a naranja y a rojo.
const LIMIT_WARNING = 70
const LIMIT_ERROR = 80

/** El color de un límite según cuánto se ha usado. */
const limitColor = (percentUsed: number): string =>
  percentUsed >= LIMIT_ERROR
    ? 'error'
    : percentUsed >= LIMIT_WARNING
      ? 'warning'
      : 'success'

// Desde qué porcentaje de su vida gastada el caché pasa a naranja y a rojo.
const CACHE_WARNING = 70
const CACHE_ERROR = 90

/** El color del caché según cuánto de su duración ya pasó. */
const cacheColor = (percentSpent: number): string =>
  percentSpent >= CACHE_ERROR
    ? 'error'
    : percentSpent >= CACHE_WARNING
      ? 'warning'
      : 'success'

/**
 * Cuántas celdas de `room` llena una barra al `percent` por ciento. Con
 * cualquier uso, por poco que sea, la barra muestra al menos una celda.
 */
const barCells = (percent: number, room: number): number =>
  Math.min(room, Math.max(percent > 0 ? 1 : 0, Math.round((percent / 100) * room)))

/**
 * Acorta una ruta por el principio para que quepa en `room` celdas, dejando
 * siempre entero el nombre de la última carpeta: `…/agents/claude-plugins`.
 */
const fitPath = (path: string, room: number): string => {
  if (path.length <= room) return path

  const parts = path.split('/')
  let shown = parts.at(-1) ?? path
  for (let index = parts.length - 2; index >= 0; index -= 1) {
    const longer = `${parts[index]}/${shown}`
    if (longer.length + 2 > room) break
    shown = longer
  }

  return `…/${shown}`
}

/** 90 -> "1m", 7200 -> "2h", 259200 -> "3d"; lo que pasa de `seconds` a `now`. */
const ago = (seconds: number, now: number): string => {
  const minutes = Math.max(0, Math.floor((now / 1000 - seconds) / 60))
  if (minutes >= 1440) return `${Math.floor(minutes / 1440)}d`
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h`

  return `${minutes}m`
}

/** La rama actual, el commit corto si no hay rama, o null fuera de un repo. */
const readBranch = async ($: EngineInterface, cwd: string) => {
  try {
    const branch = await $.process.run(['git', 'branch', '--show-current'], {
      cwd,
      timeoutMs: 3000,
    })
    if (branch.exitCode !== 0) return null
    if (branch.stdout.trim() !== '') return branch.stdout.trim()

    const commit = await $.process.run(['git', 'rev-parse', '--short', 'HEAD'], {
      cwd,
      timeoutMs: 3000,
    })

    return commit.exitCode === 0 ? `(${commit.stdout.trim()})` : null
  } catch {
    return null
  }
}

/** Los archivos con cambios y los últimos commits; null fuera de un repo. */
const readGit = async ($: EngineInterface, cwd: string): Promise<PanelGit | null> => {
  try {
    const status = await $.process.run(['git', 'status', '--porcelain', '-b'], {
      cwd,
      timeoutMs: 5000,
    })
    if (status.exitCode !== 0) return null

    const lines = status.stdout.split('\n')
    // La cabecera: "## main...origin/main [ahead 1, behind 2]".
    const head = lines.find(line => line.startsWith('## ')) ?? ''
    const entries = lines.filter(line => line.length > 3 && !line.startsWith('## '))
    // Código XY de git: X es el índice (staged) e Y la carpeta de trabajo.
    const staged = entries.filter(line => line[0] !== ' ' && line[0] !== '?').length
    const unstaged = entries.filter(line => line[1] !== ' ').length
    // Las líneas por archivo; en un repo sin commits el comando falla y no hay números.
    const numstat = await $.process.run(['git', 'diff', '--numstat', 'HEAD'], {
      cwd,
      timeoutMs: 5000,
    })
    const counts = new Map<string, { added?: number; removed?: number }>()
    if (numstat.exitCode === 0) {
      for (const line of numstat.stdout.split('\n')) {
        const found = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line)
        // Los archivos binarios traen "-": sin números.
        if (found?.[1] === undefined || found[1] === '-') continue
        counts.set(found[3] ?? '', {
          added: Number(found[1]),
          removed: Number(found[2]),
        })
      }
    }
    const files = entries.map(line => ({
      code: line.slice(0, 2).trim(),
      path: line.slice(3),
    })).map(file => ({ ...file, ...(file.code === '??' ? {} : counts.get(file.path)) }))
    // Sin stash guardado el comando falla: cuenta como cero.
    const stash = await $.process.run(
      ['git', 'rev-list', '--walk-reflogs', '--count', 'refs/stash'],
      { cwd, timeoutMs: 3000 },
    )
    const stashes = stash.exitCode === 0 ? Number.parseInt(stash.stdout, 10) || 0 : 0
    // Un repo recién creado no tiene commits: git log falla y la lista queda vacía.
    const log = await $.process.run(
      ['git', 'log', `-${MAX_COMMITS}`, '--pretty=format:%h%x09%ct%x09%s'],
      { cwd, timeoutMs: 5000 },
    )
    const hasUpstream = head.includes('...')
    // Los que faltan por subir; sin upstream el comando falla y no hay ninguno.
    const unpushed = new Set<string>()
    if (hasUpstream) {
      const ahead = await $.process.run(
        ['git', 'rev-list', '--abbrev-commit', '@{u}..HEAD'],
        { cwd, timeoutMs: 3000 },
      )
      if (ahead.exitCode === 0) {
        for (const hash of ahead.stdout.split('\n')) {
          if (hash.trim() !== '') unpushed.add(hash.trim())
        }
      }
    }
    const commits =
      log.exitCode !== 0
        ? []
        : log.stdout
            .split('\n')
            .filter(line => line.includes('\t'))
            .map(line => {
              const [hash = '', time = '', ...rest] = line.split('\t')
              const at = Number.parseInt(time, 10)

              return {
                hash,
                subject: rest.join(' '),
                ...(Number.isFinite(at) ? { at } : {}),
                ...(unpushed.has(hash) ? { isUnpushed: true } : {}),
              }
            })

    return {
      files: files.slice(0, 200),
      total: files.length,
      staged,
      unstaged,
      stashes,
      commits,
      ...(hasUpstream
        ? {
            upstream: {
              ahead: Number(/ahead (\d+)/.exec(head)?.[1] ?? 0),
              behind: Number(/behind (\d+)/.exec(head)?.[1] ?? 0),
            },
          }
        : {}),
    }
  } catch {
    return null
    return null
  }
}

/**
 * Los servidores MCP habilitados, con cuántas herramientas da cada uno. El
 * motor no los lista: se sacan de los nombres `mcp__<servidor>__<tool>`.
 */
const readMcp = async ($: EngineInterface): Promise<PanelMcp[]> => {
  try {
    const counts = new Map<string, number>()
    for (const tool of await $.tool.list()) {
      const server = tool.mcp ? tool.name.split('__')[1] : undefined
      if (server === undefined || server === '') continue
      counts.set(server, (counts.get(server) ?? 0) + 1)
    }

    return [...counts]
      .map(([name, tools]) => ({ name, tools }))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

/** Lee la sesión y guarda la foto que el panel dibuja. */
const refresh = async (
  $: EngineInterface,
  measured?: Pick<SessionUsage, 'context' | 'cost' | 'rateLimits'>,
) => {
  const [cwd, model, usage, home] = await Promise.all([
    $.session.cwd(),
    $.session.model(),
    measured ?? $.session.usage(),
    $.env.get('HOME'),
  ])
  const branch = await readBranch($, cwd)
  const isUnderHome = home !== undefined && home !== '' && cwd.startsWith(home)
  const limits: PanelLimit[] = usage.rateLimits.map(limit => {
    const resetsAt = limit.resetsAt === undefined ? NaN : Date.parse(limit.resetsAt)

    return {
      kind: limit.kind,
      percentUsed: limit.percentUsed,
      ...(Number.isFinite(resetsAt) ? { resetsAt } : {}),
    }
  })
  const next: PanelInfo = {
    limits,
    cwd: isUnderHome ? `~${cwd.slice(home.length)}` : cwd,
    branch,
    model,
    window: usage.context.window,
    ...(usage.context.tokens === undefined ? {} : { tokens: usage.context.tokens }),
    ...(usage.context.percent === undefined ? {} : { percent: usage.context.percent }),
    ...(usage.cost === undefined ? {} : { usd: usage.cost.usd }),
  }

  await update($, info, () => next)
  const { usd } = next
  if (usd !== undefined) {
    // El costo del último turno es lo que subió el total entre dos mediciones.
    await update($, session, before => ({
      ...before,
      usd,
      turnUsd:
        before.usd !== null && usd > before.usd ? usd - before.usd : before.turnUsd,
    }))
  }
  const repo = branch === null ? null : await readGit($, cwd)
  await update($, git, () => repo)
  const servers = await readMcp($)
  await update($, mcp, () => servers)
}

/**
 * Junta la lista en vivo de subagentes con lo que el panel ya sabía de ellos
 * (sus tokens). Uno que ya no está en la lista y no había terminado se da por
 * completado.
 */
const syncAgents = async ($: EngineInterface) => {
  const live = await $.agent.list()

  await update($, agents, known => {
    const rows = new Map<string, PanelAgent>()
    for (const row of known) {
      rows.set(row.id, ENDED.has(row.status) ? row : { ...row, status: 'completed' })
    }
    for (const one of live) {
      const before = rows.get(one.id)
      rows.set(one.id, {
        id: one.id,
        type: one.type,
        description: one.description,
        status: one.status,
        tokensIn: before?.tokensIn ?? 0,
        tokensOut: before?.tokensOut ?? 0,
      })
    }

    return [...rows.values()].slice(-50)
  })
}

/** Toda la entrada de un turno: lo nuevo, lo leído del caché y lo escrito en él. */
const inputTotal = (usage: {
  input_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}): number =>
  usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens

/** Anota que acaba de llegar una respuesta: el caché vuelve a empezar. */
const touchCache = async ($: EngineInterface) => {
  const at = await $.clock.now()
  await update($, cache, () => ({ at, isAlerted: false }))
  await update($, clock, () => at)
}

/** Lo que dura el caché: lo fijado en /config, si no promptCacheTtl, si no 5 min. */
async function cacheDuration($: EngineInterface, chosen: number | undefined) {
  return (
    chosen ??
    ttlMs(await $.settings.read({ key: 'promptCacheTtl' }).catch(() => undefined)) ??
    DEFAULT_CACHE_MS
  )
}

/**
 * Un tic del reloj: mueve la hora del panel y, si queda poco para que venza el
 * caché, avisa con un toast una sola vez por respuesta.
 */
async function tickPanel(
  $: EngineInterface,
  chosen: number | undefined,
  isAlertOn: boolean,
) {
  const at = await $.clock.now()
  await update($, clock, () => at)
  if (isLazygitOpen) await refresh($).catch(() => undefined)
  if (!isAlertOn) return

  const last = await read($, cache)
  if (last.at === null || last.isAlerted) return

  const cacheMs = await cacheDuration($, chosen)
  const left = cacheMs - (at - last.at)
  const warnMs = cacheMs >= 3_600_000 ? ALERT_LONG_MS : ALERT_SHORT_MS
  if (left <= 0 || left > warnMs) return

  await update($, cache, before => ({ ...before, isAlerted: true }))
  $.ui.toast(`El caché vence en ${countdown(left)}.`)
}

// Cuándo se releyó git por última vez tras una herramienta.
let lastReread = 0

/** Relee git tras una herramienta, con el freno de una vez por segundo. */
async function rereadGit($: EngineInterface) {
  const at = await $.clock.now()
  if (at - lastReread < REREAD_MS) return

  lastReread = at
  await refresh($).catch(() => undefined)
}

/** `git fetch` con tope de 30 s; avisa con un toast y relee el repo. */
async function fetchRepo($: EngineInterface) {
  try {
    const cwd = await $.session.cwd()
    const done = await $.process.run(['git', 'fetch'], { cwd, timeoutMs: 30_000 })
    const reason = done.stderr.trim().split('\n')[0] ?? ''
    $.ui.toast(
      done.exitCode === 0
        ? 'Fetch hecho.'
        : `No se pudo hacer fetch${reason === '' ? '.' : `: ${reason}`}`,
    )
  } catch {
    $.ui.toast('No se pudo hacer fetch (tiempo agotado).')
  }
  await refresh($).catch(() => undefined)
}

// Mientras lazygit está abierto, el panel relee el repo en cada tic del reloj.
let isLazygitOpen = false

/**
 * Abre lazygit sobre la carpeta de la sesión: en un popup de tmux si la
 * sesión corre dentro de tmux, y si no en una ventana de terminal nueva
 * (lazygit necesita una terminal propia; no se puede dibujar en el panel).
 */
const openLazygit = async ($: EngineInterface, chosenTerminal?: string) => {
  if (isLazygitOpen) {
    $.ui.toast('lazygit ya está abierto.')

    return
  }

  const has = async (name: string) =>
    $.process
      .run(['sh', '-c', 'command -v "$1" >/dev/null', 'sh', name], { timeoutMs: 3000 })
      .then(found => found.exitCode === 0)
      .catch(() => false)

  if (!(await has('lazygit'))) {
    $.ui.toast('lazygit no está instalado.')

    return
  }

  const cwd = await $.session.cwd()
  let argv: string[]
  let where: string
  const tmux = await $.env.get('TMUX')
  if (tmux !== undefined && tmux !== '') {
    argv = ['tmux', 'display-popup', '-E', '-w', '90%', '-h', '90%', '-d', cwd, 'lazygit']
    where = 'tmux'
  } else {
    let terminal = chosenTerminal ?? (await $.env.get('TERMINAL'))
    if (terminal === undefined || terminal === '') {
      terminal = undefined
      for (const name of TERMINALS) {
        if (await has(name)) {
          terminal = name
          break
        }
      }
    }
    if (terminal === undefined) {
      $.ui.toast('No encontré una terminal para abrir lazygit; elige una en /config.')

      return
    }
    where = terminal.split('/').at(-1) ?? terminal
    argv = [terminal, ...(TERMINAL_ARGS[where] ?? ['-e']), 'lazygit', '-p', cwd]
  }

  isLazygitOpen = true
  $.ui.toast(`lazygit abierto en ${where}.`)
  // El bucle es la vida del proceso: sigue hasta que se cierra lazygit.
  void (async () => {
    try {
      for await (const piece of $.process.spawn({ argv, cwd })) void piece
    } catch {
      $.ui.toast(`No se pudo abrir lazygit en ${where}.`)
    } finally {
      isLazygitOpen = false
      // Lo que se hizo en lazygit (commits, stage) se ve al cerrarlo.
      await refresh($).catch(() => undefined)
    }
  })()
}

export const register: Register = (on, options) => {
  // Cuánto dura el caché del prompt. En /config: "auto" (por defecto) lo lee
  // de promptCacheTtl en la configuración de Claude Code; "5m" o "1h" lo fijan.
  const chosenCacheMs = ttlMs(options['cache'])
  // En /config: avisa con un toast cuando al caché le queda poco.
  const isAlertOn = options['cacheAlert'] !== 'off'
  const accent = ACCENTS[String(options['color'])] ?? '#4aa8ff'
  // En /config: en qué terminal abrir lazygit; "auto" busca uno instalado.
  const chosenTerminal =
    typeof options['terminal'] === 'string' && options['terminal'] !== 'auto'
      ? options['terminal']
      : undefined
  let ticking: { cancel: () => void } | undefined
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'panel',
      description: 'Abre el panel de la sesión (/panel cerrar lo cierra)',
      argumentHint: '[cerrar]',
    })
    const started = await next(e)
    lastReread = 0

    if (e.isInteractive) {
      await refresh($)
      // El reloj del panel: mueve las cuentas regresivas del caché y los límites.
      ticking?.cancel()
      ticking = $.clock.every(TICK_MS, () => {
        void tickPanel($, chosenCacheMs, isAlertOn).catch(() => undefined)
      })
      const startedAt = await $.clock.now()
      await update($, session, () => ({ startedAt, usd: null, turnUsd: null }))
      void $.ui.open({ id: PANE, title: TITLE, columns: START_COLUMNS })
    }

    return started
  })

  on('command.run', { command: 'panel' }, async ($, e) => {
    if (/^(cerrar|close|off)$/i.test(e.args.trim())) {
      await $.ui.close({ id: PANE })

      return { text: 'Panel cerrado. Escribe /panel para abrirlo de nuevo.' }
    }

    await refresh($)
    const { isPlaced } = await $.ui.open({
      id: PANE,
      title: TITLE,
      columns: Math.max(24, Math.round(e.presentation.columns * SHARE)),
    })

    return {
      text: isPlaced
        ? 'Panel abierto.'
        : 'El panel está listo, pero esta sesión no tiene dónde dibujarlo.',
    }
  })

  // El motor avisa cada vez que cambia el contexto o el costo.
  on('session.measure', async ($, e, next) => {
    const measured = await next(e)
    // El contexto solo se mueve cuando llega una respuesta del hilo principal.
    // La primera medida de una sesión nueva llega sin tokens: ahí no hay caché.
    if (e.changed.includes('context') && e.context.tokens !== undefined) {
      await touchCache($)
    }
    await refresh($, e)

    return measured
  })

  // Al terminar cada turno (también los de subagentes) suma sus tokens.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    const usage = e.usage

    if (usage !== undefined) {
      const add: PanelTotals = {
        tokensIn: inputTotal(usage),
        tokensOut: usage.output_tokens,
      }
      await update($, totals, sum => ({
        tokensIn: sum.tokensIn + add.tokensIn,
        tokensOut: sum.tokensOut + add.tokensOut,
      }))
    }

    if (e.agentId === undefined) {
      if (usage !== undefined) {
        await update($, cacheStats, before => ({
          read: before.read + usage.cache_read_input_tokens,
          input: before.input + inputTotal(usage),
        }))
      }
      // La rama o la carpeta pueden haber cambiado durante el turno.
      await refresh($)
    } else {
      const { agentId } = e
      await syncAgents($)
      if (usage !== undefined) {
        await update($, agents, rows =>
          rows.map(row =>
            row.id === agentId
              ? {
                  ...row,
                  tokensIn:
                    row.tokensIn +
                    usage.input_tokens +
                    usage.cache_read_input_tokens +
                    usage.cache_creation_input_tokens,
                  tokensOut: row.tokensOut + usage.output_tokens,
                }
              : row,
          ),
        )
      }
    }

    return done
  })

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    await syncAgents($)

    return spawned
  })

  // La lista de tareas, por cualquiera de las dos herramientas que la escriben.
  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)
    const list: PanelTodo[] = e.todos.map((todo, index) => ({
      id: String(index),
      text: todo.content,
      status: todo.status,
    }))
    await update($, todos, () => list)

    return ran
  })

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)
    // El resultado trae el id que el motor le dio a la tarea.
    const result: unknown = ran.deny === undefined ? ran.result : undefined
    const task =
      typeof result === 'object' && result !== null && 'task' in result
        ? (result.task as { id?: unknown; subject?: unknown } | null)
        : null

    if (typeof task?.id === 'string') {
      const added: PanelTodo = {
        id: task.id,
        text: typeof task.subject === 'string' ? task.subject : e.subject,
        status: 'pending',
      }
      await update($, todos, list => [
        ...list.filter(todo => todo.id !== added.id),
        added,
      ])
    }

    return ran
  })

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true) return ran

    const { taskId, status, subject } = e
    await update($, todos, list =>
      status === 'deleted'
        ? list.filter(todo => todo.id !== taskId)
        : list.map(todo =>
            todo.id === taskId
              ? {
                  ...todo,
                  ...(status === undefined ? {} : { status }),
                  ...(subject === undefined ? {} : { text: subject }),
                }
              : todo,
          ),
    )

    return ran
  })

  // Estas herramientas cambian el repo: git se relee al terminar cada una.
  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const ran = await next(e)
    await rereadGit($)

    return ran
  })
  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)
    await rereadGit($)

    return ran
  })
  on('tool.call', { tool: 'NotebookEdit' }, async ($, e, next) => {
    const ran = await next(e)
    await rereadGit($)

    return ran
  })
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    await rereadGit($)

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const now = await read($, info)
    const ticked = await read($, clock)
    const cachedAt = (await read($, cache)).at
    const cacheMs = await cacheDuration($, chosenCacheMs)
    const stats = await read($, cacheStats)
    const spent = await read($, session)
    // Lo que le queda al caché, contado con el reloj del panel.
    const cacheLeft =
      cachedAt === null ? null : cacheMs - (Math.max(ticked, cachedAt) - cachedAt)
    // Qué parte de la vida del caché ya pasó: la barra se llena con el tiempo.
    const cacheSpent =
      cacheLeft === null
        ? null
        : Math.min(100, Math.max(0, ((cacheMs - cacheLeft) / cacheMs) * 100))
    const compactNow = async () => {
      try {
        const done = await $.session.compact()
        $.ui.toast(
          'skip' in done && done.skip !== undefined
            ? 'No se compactó la conversación.'
            : 'Conversación compactada.',
        )
      } catch {
        $.ui.toast('Espera a que Claude termine para compactar.')
      }
    }
    const sum = await read($, totals)
    const agentRows = (await read($, agents)).slice(-MAX_AGENTS)
    const todoRows = await read($, todos)
    const servers = await read($, mcp)
    const doneTodos = todoRows.filter(todo => todo.status === 'completed').length
    // Si no caben todas, se muestran primero las que faltan.
    const shownTodos =
      todoRows.length <= MAX_TODOS
        ? todoRows
        : todoRows.filter(todo => todo.status !== 'completed').slice(0, MAX_TODOS)
    const columns = Math.max(20, e.props.bodyColumns)

    if (now === null) {
      return <Text dimColor>Leyendo la sesión…</Text>
    }

    const percent = now.percent ?? 0
    const level =
      percent >= 85
        ? { color: 'error', label: 'Crítico' }
        : percent >= 60
          ? { color: 'warning', label: 'Alerta' }
          : { color: 'success', label: 'OK' }
    // Ancho interior del marco: sin los dos bordes ni el relleno lateral.
    const inner = columns - 4
    const filled = barCells(percent, inner)

    // Las dos filas de Contexto llevan sus palabras ("tokens", "in", "out",
    // "Costo") mientras quepan en una línea; en un panel angosto se quitan.
    const used = now.tokens === undefined ? '—' : compact(now.tokens)
    const state = `● ${level.label} ${percent}%`
    const hasRoomForTokens =
      `${used} / ${compact(now.window)} tokens`.length + 1 + state.length <= inner
    const tokensIn = compact(sum.tokensIn)
    const tokensOut = compact(sum.tokensOut)
    const cost = now.usd === undefined ? '—' : `$${now.usd.toFixed(3)}`
    const hasRoomForCost =
      `▲ ${tokensIn} in  ▼ ${tokensOut} out`.length + 1 + `Costo ${cost}`.length <=
      inner
    // El costo del último turno va junto al total solo si cabe en la fila.
    const turnCost =
      now.usd !== undefined && spent.turnUsd !== null && spent.turnUsd > 0
        ? ` (+$${spent.turnUsd.toFixed(3)})`
        : ''
    const leftWidth = hasRoomForCost
      ? `▲ ${tokensIn} in  ▼ ${tokensOut} out`.length
      : `▲ ${tokensIn} ▼ ${tokensOut}`.length
    const hasRoomForTurn =
      leftWidth + 1 + (hasRoomForCost ? 'Costo '.length : 0) + cost.length + turnCost.length <=
      inner
    // Lo leído del caché frente a toda la entrada; null mientras no hay datos.
    const readPercent =
      stats.input > 0 ? Math.round((stats.read / stats.input) * 100) : null

    // Un solo marco. Cada sección empieza con una línea en blanco y su título,
    // sin raya: las únicas líneas horizontales del panel son las barras de
    // progreso. `action` va a la derecha del título (el botón Compact).
    const title = (text: string, action?: JSX.Element) => (
      <Box flexDirection="row" justifyContent="space-between" gap={1} marginTop={1}>
        <Text bold color={accent} wrap="truncate-end">
          {text}
        </Text>
        {action !== undefined && <Box flexShrink={0}>{action}</Box>}
      </Box>
    )
    const bar = (cells: number, color: string) => (
      <Text>
        <Text color={color}>{'━'.repeat(cells)}</Text>
        <Text dimColor>{'─'.repeat(inner - cells)}</Text>
      </Text>
    )
    const row = (label: string, value: string, color?: string) => (
      <Box flexDirection="row" justifyContent="space-between" gap={1}>
        <Box flexShrink={0}>
          <Text dimColor>{label}</Text>
        </Box>
        <Text wrap="truncate-start" {...(color === undefined ? {} : { color })}>
          {value}
        </Text>
      </Box>
    )

    // Las pestañas: con el panel enfocado, 1 y 2 cambian de vista.
    const shown = await read($, tab)
    const tabs = (
      <Box flexDirection="row" gap={2}>
        <Button
          key="tab-main"
          plain
          hotkey="1"
          label="MAIN"
          dimColor={shown !== 'main'}
          onPress={() => update($, tab, () => 'main' as const)}
        />
        <Button
          key="tab-git"
          plain
          hotkey="2"
          label="GIT"
          dimColor={shown !== 'git'}
          onPress={() => update($, tab, () => 'git' as const)}
        />
      </Box>
    )

    const repo = await read($, git)
    const nowMs = await $.clock.now()
    const files = repo?.files ?? []
    const fileColor = (code: string) =>
      code.includes('D')
        ? 'error'
        : code === '??' || code.includes('A')
          ? 'success'
          : 'warning'
    // La lista de archivos con cambios, igual en MAIN y en GIT; solo cambia el tope.
    const added = files.reduce((sum, file) => sum + (file.added ?? 0), 0)
    const removed = files.reduce((sum, file) => sum + (file.removed ?? 0), 0)
    const hasNumbers = files.some(file => file.added !== undefined)
    const changes = (max: number) => (
      <Box flexDirection="column">
        {title(
          `Cambios · ${repo?.total ?? files.length}${hasNumbers ? `  +${added} −${removed}` : ''}`,
        )}
        {files.length === 0 && <Text dimColor>Sin cambios pendientes.</Text>}
        {files.slice(0, max).map(file => {
          const numbers =
            file.added === undefined ? '' : `+${file.added} −${file.removed ?? 0}`

          return (
            <Box flexDirection="row" justifyContent="space-between" gap={1}>
              <Text wrap="truncate-start">
                <Text color={fileColor(file.code)}>{file.code.padEnd(2)} </Text>
                {fitPath(file.path, inner - 3 - (numbers === '' ? 0 : numbers.length + 1))}
              </Text>
              {numbers !== '' && (
                <Box flexShrink={0}>
                  <Text>
                    <Text color={file.added === 0 ? undefined : 'success'} dimColor={file.added === 0}>
                      +{file.added}
                    </Text>{' '}
                    <Text color={file.removed ? 'error' : undefined} dimColor={!file.removed}>
                      −{file.removed ?? 0}
                    </Text>
                  </Text>
                </Box>
              )}
            </Box>
          )
        })}
        {(repo?.total ?? files.length) > max && (
          <Text dimColor>… y {(repo?.total ?? files.length) - max} más</Text>
        )}
      </Box>
    )

    if (shown === 'git') {
      const upstream = repo?.upstream

      return (
        <Box
          flexDirection="column"
          width={columns}
          borderStyle="round"
          borderColor={accent}
          paddingX={1}
        >
          {tabs}
          {title(
            'Repositorio',
            repo === null ? undefined : (
              <Box flexDirection="row" gap={1}>
                <Button key="fetch" label="fetch" hotkey="f" onPress={() => fetchRepo($)} />
                <Button
                  key="lazygit"
                  label="lazygit"
                  hotkey="g"
                  onPress={() => openLazygit($, chosenTerminal)}
                />
              </Box>
            ),
          )}
          {repo === null ? (
            <Text dimColor>Esta carpeta no es un repositorio git.</Text>
          ) : (
            row('Rama', now.branch ?? '—', 'success')
          )}
          {repo !== null &&
            (upstream === undefined
              ? row('Remoto', 'sin upstream', 'inactive')
              : row(
                  'Remoto',
                  upstream.ahead === 0 && upstream.behind === 0
                    ? 'al día'
                    : `↑${upstream.ahead} ↓${upstream.behind}`,
                  upstream.ahead === 0 && upstream.behind === 0 ? 'success' : 'warning',
                ))}
          {repo !== null &&
            repo.total > 0 &&
            row('Stage', `${repo.staged} listos · ${repo.unstaged} sin stage`)}
          {repo !== null && repo.stashes > 0 && row('Stash', String(repo.stashes))}

          {repo !== null && changes(MAX_FILES)}

          {repo !== null && title('Commits')}
          {repo !== null && repo.commits.length === 0 && (
            <Text dimColor>Todavía no hay commits.</Text>
          )}
          {(repo?.commits ?? []).map(commit => (
            <Box flexDirection="row" justifyContent="space-between" gap={1}>
              <Text wrap="truncate-end">
                <Text dimColor>{commit.hash} </Text>
                {commit.isUnpushed === true && <Text color="warning">↑ </Text>}
                {commit.subject}
              </Text>
              {commit.at !== undefined && (
                <Box flexShrink={0}>
                  <Text dimColor>{ago(commit.at, nowMs)}</Text>
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )
    }

    return (
      <Box
        flexDirection="column"
        width={columns}
        borderStyle="round"
        borderColor={accent}
        paddingX={1}
      >
        {tabs}
        {title('Status')}
        {row('Carpeta', fitPath(now.cwd, inner - 'Carpeta'.length - 1))}
        {row('Rama', now.branch ?? 'sin git', now.branch === null ? 'inactive' : 'success')}
        {row('Modelo', now.model)}
        {spent.startedAt !== null &&
          row('Sesión', countdown(Math.max(ticked, spent.startedAt) - spent.startedAt))}

        {title(
          'Contexto',
          // Compactar actúa sobre el contexto: por eso vive en su título.
          <Button key="compact" label="Compact" hotkey="c" onPress={compactNow} />,
        )}
        <Box flexDirection="row" justifyContent="space-between" gap={1}>
          <Text>
            {used}
            <Text dimColor>
              {' '}
              / {compact(now.window)}
              {hasRoomForTokens ? ' tokens' : ''}
            </Text>
          </Text>
          <Text color={level.color}>
            ● {level.label} {percent}%
          </Text>
        </Box>
        {bar(filled, level.color)}
        <Box flexDirection="row" justifyContent="space-between" gap={1}>
          <Text>
            <Text dimColor>▲ </Text>
            {tokensIn}
            <Text dimColor>{hasRoomForCost ? ' in  ▼ ' : ' ▼ '}</Text>
            {tokensOut}
            {hasRoomForCost && <Text dimColor> out</Text>}
          </Text>
          <Text>
            {hasRoomForCost && <Text dimColor>Costo </Text>}
            {cost}
            {hasRoomForTurn && turnCost !== '' && <Text dimColor>{turnCost}</Text>}
          </Text>
        </Box>

        {title(
          'Caché',
          // Sección propia: lo que le queda va a la derecha del título.
          cacheLeft === null ? (
            <Text dimColor>—</Text>
          ) : cacheLeft <= 0 ? (
            <Text color="inactive">frío</Text>
          ) : (
            <Text color={cacheColor(cacheSpent ?? 0)}>~{countdown(cacheLeft)}</Text>
          ),
        )}
        {cacheSpent !== null &&
          bar(barCells(cacheSpent, inner), cacheColor(cacheSpent))}
        {row(
          'Leído del caché',
          readPercent === null ? '—' : `${readPercent}%`,
          readPercent === null || readPercent < READ_FAIR
            ? undefined
            : readPercent >= READ_GOOD
              ? 'success'
              : 'warning',
        )}

        {now.limits.length > 0 && title('Límites')}
        {now.limits.map(limit => {
          const left = limit.resetsAt === undefined ? null : limit.resetsAt - ticked
          const used = `${Math.round(limit.percentUsed)}%`

          const color = limitColor(limit.percentUsed)

          return (
            <Box flexDirection="column">
              {row(
                LIMIT_NAMES[limit.kind] ?? limit.kind,
                left === null || left <= 0 || ticked === 0
                  ? used
                  : `${used} · ${countdown(left)}`,
                // Por debajo del aviso el número va sin color; la barra sí lo lleva.
                limit.percentUsed >= LIMIT_WARNING ? color : undefined,
              )}
              {LIMITS_WITH_BAR.has(limit.kind) &&
                bar(barCells(limit.percentUsed, inner), color)}
            </Box>
          )
        })}

        {servers.length > 0 && title(`MCP · ${servers.length}`)}
        {servers.slice(0, MAX_MCP).map(server => (
          <Box flexDirection="row" justifyContent="space-between" gap={1}>
            <Text wrap="truncate-end">
              <Text color="success">● </Text>
              {server.name}
            </Text>
            <Box flexShrink={0}>
              <Text dimColor>
                {server.tools} {server.tools === 1 ? 'tool' : 'tools'}
              </Text>
            </Box>
          </Box>
        ))}
        {servers.length > MAX_MCP && (
          <Text dimColor>… y {servers.length - MAX_MCP} más</Text>
        )}

        {repo !== null && changes(MAX_MAIN_FILES)}

        {agentRows.length > 0 && title(`Subagentes · ${agentRows.length}`)}
        {agentRows.map(agent => {
          const mark = ENDED.has(agent.status)
            ? agent.status === 'completed'
              ? { glyph: '✓', color: 'success' }
              : { glyph: '✗', color: 'error' }
            : { glyph: '●', color: 'warning' }

          return (
            <Box flexDirection="column">
              <Box flexDirection="row" justifyContent="space-between" gap={1}>
                <Text wrap="truncate-end">
                  <Text color={mark.color}>{mark.glyph} </Text>
                  {agent.type}
                </Text>
                <Box flexShrink={0}>
                  <Text dimColor>
                    ▲ {compact(agent.tokensIn)} ▼ {compact(agent.tokensOut)}
                  </Text>
                </Box>
              </Box>
              <Text dimColor wrap="truncate-end">
                {'  '}
                {agent.description}
              </Text>
            </Box>
          )
        })}

        {todoRows.length > 0 && title(`Todos · ${doneTodos} de ${todoRows.length}`)}
        {shownTodos.map(todo =>
          todo.status === 'completed' ? (
            <Text dimColor>✓ {todo.text}</Text>
          ) : todo.status === 'in_progress' ? (
            <Text>
              <Text color="warning">▸ </Text>
              {todo.text}
            </Text>
          ) : (
            <Text>
              <Text dimColor>○ </Text>
              {todo.text}
            </Text>
          ),
        )}
      </Box>
    )
  })
}
