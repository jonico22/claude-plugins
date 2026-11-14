import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionUsage } from 'claude-code'

import type {
  PanelAgent,
  PanelGit,
  PanelInfo,
  PanelLimit,
  PanelMcp,
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
const cache = atom({ plugin: 'panel-claude', key: 'cache' } as const, { at: null }, {
  shape: 'cache-1',
})
// La hora del reloj del panel; cada cambio redibuja las cuentas regresivas.
const clock = atom({ plugin: 'panel-claude', key: 'now' } as const, 0)

const git = atom({ plugin: 'panel-claude', key: 'git' } as const, null, {
  shape: 'git-1',
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
const MAX_FILES = 12
// En MAIN la lista de cambios es más corta: comparte el panel con todo lo demás.
const MAX_MAIN_FILES = 6
const MAX_MCP = 8
const MAX_COMMITS = 6
const TICK_MS = 5000
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
    const status = await $.process.run(['git', 'status', '--porcelain'], {
      cwd,
      timeoutMs: 5000,
    })
    if (status.exitCode !== 0) return null

    const files = status.stdout
      .split('\n')
      .filter(line => line.length > 3)
      .map(line => ({ code: line.slice(0, 2).trim(), path: line.slice(3) }))
    // Un repo recién creado no tiene commits: git log falla y la lista queda vacía.
    const log = await $.process.run(
      ['git', 'log', `-${MAX_COMMITS}`, '--pretty=format:%h%x09%s'],
      { cwd, timeoutMs: 5000 },
    )
    const commits =
      log.exitCode !== 0
        ? []
        : log.stdout
            .split('\n')
            .filter(line => line.includes('\t'))
            .map(line => {
              const [hash = '', ...rest] = line.split('\t')

              return { hash, subject: rest.join(' ') }
            })

    return { files: files.slice(0, 200), commits }
  } catch {
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

/** Anota que acaba de llegar una respuesta: el caché vuelve a empezar. */
const touchCache = async ($: EngineInterface) => {
  const at = await $.clock.now()
  await update($, cache, () => ({ at }))
  await update($, clock, () => at)
}

export const register: Register = (on, options) => {
  // Cuánto dura el caché del prompt. En /config: "auto" (por defecto) lo lee
  // de promptCacheTtl en la configuración de Claude Code; "5m" o "1h" lo fijan.
  const chosenCacheMs = ttlMs(options['cache'])
  const accent = ACCENTS[String(options['color'])] ?? '#4aa8ff'
  let ticking: { cancel: () => void } | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'panel',
      description: 'Abre el panel de la sesión (/panel cerrar lo cierra)',
      argumentHint: '[cerrar]',
    })
    const started = await next(e)

    if (e.isInteractive) {
      await refresh($)
      // El reloj del panel: mueve las cuentas regresivas del caché y los límites.
      ticking?.cancel()
      ticking = $.clock.every(TICK_MS, () => {
        void $.clock.now().then(at => update($, clock, () => at))
      })
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
        tokensIn:
          usage.input_tokens +
          usage.cache_read_input_tokens +
          usage.cache_creation_input_tokens,
        tokensOut: usage.output_tokens,
      }
      await update($, totals, sum => ({
        tokensIn: sum.tokensIn + add.tokensIn,
        tokensOut: sum.tokensOut + add.tokensOut,
      }))
    }

    if (e.agentId === undefined) {
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

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const now = await read($, info)
    const ticked = await read($, clock)
    const cachedAt = (await read($, cache)).at
    const cacheMs =
      chosenCacheMs ??
      ttlMs(await $.settings.read({ key: 'promptCacheTtl' }).catch(() => undefined)) ??
      DEFAULT_CACHE_MS
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
    const files = repo?.files ?? []
    const fileColor = (code: string) =>
      code.includes('D')
        ? 'error'
        : code === '??' || code.includes('A')
          ? 'success'
          : 'warning'
    // La lista de archivos con cambios, igual en MAIN y en GIT; solo cambia el tope.
    const changes = (max: number) => (
      <Box flexDirection="column">
        {title(`Cambios · ${files.length}`)}
        {files.length === 0 && <Text dimColor>Sin cambios pendientes.</Text>}
        {files.slice(0, max).map(file => (
          <Text wrap="truncate-start">
            <Text color={fileColor(file.code)}>{file.code.padEnd(2)} </Text>
            {fitPath(file.path, inner - 3)}
          </Text>
        ))}
        {files.length > max && <Text dimColor>… y {files.length - max} más</Text>}
      </Box>
    )

    if (shown === 'git') {

      return (
        <Box
          flexDirection="column"
          width={columns}
          borderStyle="round"
          borderColor={accent}
          paddingX={1}
        >
          {tabs}
          {title('Repositorio')}
          {repo === null ? (
            <Text dimColor>Esta carpeta no es un repositorio git.</Text>
          ) : (
            row('Rama', now.branch ?? '—', 'success')
          )}

          {repo !== null && changes(MAX_FILES)}

          {repo !== null && title('Commits')}
          {repo !== null && repo.commits.length === 0 && (
            <Text dimColor>Todavía no hay commits.</Text>
          )}
          {(repo?.commits ?? []).map(commit => (
            <Text wrap="truncate-end">
              <Text dimColor>{commit.hash} </Text>
              {commit.subject}
            </Text>
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
          </Text>
        </Box>
        <Box flexDirection="row" justifyContent="space-between" gap={1}>
          <Text dimColor>Caché</Text>
          {cacheLeft === null ? (
            <Text dimColor>—</Text>
          ) : cacheLeft <= 0 ? (
            <Text color="inactive">frío</Text>
          ) : (
            <Text color={cacheColor(cacheSpent ?? 0)}>~{countdown(cacheLeft)}</Text>
          )}
        </Box>
        {cacheSpent !== null &&
          bar(barCells(cacheSpent, inner), cacheColor(cacheSpent))}

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
