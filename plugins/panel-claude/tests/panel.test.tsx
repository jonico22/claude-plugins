import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

type On = Parameters<TestBody>[1]

const PANE = {
  plugin: 'panel-claude',
  component: 'Pane',
  requestId: 'panel-claude',
  props: {
    title: 'Panel',
    isFocused: false,
    bodyColumns: 44,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('el panel muestra carpeta, rama, modelo, contexto y costo', async ($, on) => {
  // Cada hook aquí hace de motor: nada corre debajo del plugin.
  on('command.register', () => ({ value: { command: 'panel' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  const clock = mock.clock(on, { now: 1_000_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/home/ana/proyectos/demo' }))
  on('session.model', () => ({ value: 'opus' }))
  on('env.get', () => ({ value: '/home/ana' }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { tokens: 199_000, window: 272_000, percent: 73 },
      rateLimits: [],
      cost: { usd: 1.5 },
    },
  }))
  on('process.run', () => ({
    value: {
      exitCode: 0,
      stdout: 'feature/panel\n',
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const has = async (text: RegExp) =>
    expect(await ui.find({ type: 'Text', text })).toBeDefined()

  await has(/~\/proyectos\/demo/)
  await has(/feature\/panel/)
  await has(/opus/)
  await has(/199k/)
  await has(/Alerta 73%/)
  await has(/\$1\.500/)
  await ui.unmount()
})

test('sin datos todavía, el panel lo dice', async $ => {
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect((await ui.find({ type: 'Text' }))?.text).toBe('Leyendo la sesión…')
  await ui.unmount()
})

test('muestra las tareas y los subagentes con sus tokens', async ($, on) => {
  on('command.register', () => ({ value: { command: 'panel' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  const clock = mock.clock(on, { now: 1_000_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/tmp/demo' }))
  on('session.model', () => ({ value: 'opus' }))
  on('env.get', () => ({ value: undefined }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] },
  }))
  on('process.run', () => ({
    value: {
      exitCode: 128,
      stdout: '',
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  on('agent.list', () => ({
    value: [
      { id: 'a1', type: 'Explore', description: 'Buscar rutas', status: 'running' },
    ],
  }))
  on('tool.call', (_, e) =>
    e.tool === 'TaskCreate'
      ? { result: { task: { id: '7', subject: 'Escribir pruebas' } } }
      : { result: {} },
  )
  on('turn.complete', (_, e) => ({ text: e.answer }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({
    tool: 'TaskCreate',
    subject: 'Escribir pruebas',
    description: 'x',
  })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '7', status: 'in_progress' })
  await $.turn.complete({
    answer: 'listo',
    durationMs: 10,
    isAborted: false,
    turnId: 't1',
    agentId: 'a1',
    reason: 'answer',
    usage: {
      model: 'haiku',
      input_tokens: 1000,
      output_tokens: 250,
      cache_read_input_tokens: 4000,
      cache_creation_input_tokens: 0,
    },
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const has = async (text: RegExp) =>
    expect(await ui.find({ type: 'Text', text })).toBeDefined()

  // En MAIN solo hay un resumen de una línea por sección.
  await has(/Todos · 0 de 1/)
  await has(/Escribir pruebas/)
  await has(/Subagentes · 1 activo de 1/)
  expect(await ui.find({ type: 'Text', text: /Explore/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Buscar rutas/ })).toBeUndefined()

  // La pestaña TAREAS los muestra completos.
  await ui.press({ key: 'tab-tasks' })
  await has(/Todos · 0 de 1/)
  await has(/▸ Escribir pruebas/)
  await has(/Subagentes · 1/)
  await has(/Explore/)
  await has(/▲ 5k ▼ 250/)
  await has(/Buscar rutas/)
  expect(await ui.find({ type: 'Text', text: /Contexto/ })).toBeUndefined()
  await ui.unmount()
})

test('sin subagentes ni todos, MAIN no muestra su resumen', async ($, on) => {
  baseEngine(on)
  mock.clock(on, { now: 1_000_000 })
  on('process.run', () => ({ value: { ...OK, exitCode: 128, stdout: '' } }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Subagentes|Todos/ })).toBeUndefined()
  await ui.press({ key: 'tab-tasks' })
  expect(await ui.find({ type: 'Text', text: /Sin subagentes/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Sin tareas/ })).toBeDefined()
  await ui.unmount()
})

test('en un panel angosto acorta la ruta y deja el nombre de la carpeta', async ($, on) => {
  on('command.register', () => ({ value: { command: 'panel' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  const clock = mock.clock(on, { now: 1_000_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({
    value: '/home/ana/Documentos/proyects/agents/claude-plugins',
  }))
  on('session.model', () => ({ value: 'opus' }))
  on('env.get', () => ({ value: '/home/ana' }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] },
  }))
  on('process.run', () => ({
    value: {
      exitCode: 128,
      stdout: '',
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({
    ...PANE,
    props: { ...PANE.props, bodyColumns: 36 },
    surface: 'terminal',
  })
  const path = await ui.find({ type: 'Text', text: /claude-plugins/ })

  expect(path?.text).toBe('…/agents/claude-plugins')
  await ui.unmount()
})

test('muestra el caché, los límites y el botón Compact', async ($, on) => {
  let compacted = 0
  on('command.register', () => ({ value: { command: 'panel' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  const clock = mock.clock(on, { now: 1_000_000 })
  on('ui.toast', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/tmp/demo' }))
  on('session.model', () => ({ value: 'opus' }))
  on('env.get', () => ({ value: undefined }))
  on('process.run', () => ({
    value: {
      exitCode: 128,
      stdout: '',
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] },
  }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.compact', () => {
    compacted += 1

    return { skip: 'prueba' }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.measure({
    context: { tokens: 50_000, window: 200_000, percent: 25 },
    rateLimits: [
      {
        kind: 'five_hour',
        percentUsed: 23.5,
        resetsAt: new Date(1_000_000 + 2 * 3_600_000 + 15 * 60_000).toISOString(),
      },
      { kind: 'seven_day', percentUsed: 7 },
    ],
    changed: ['context', 'rateLimits'],
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const has = async (text: RegExp) =>
    expect(await ui.find({ type: 'Text', text })).toBeDefined()

  // La respuesta acaba de llegar: quedan los 5 minutos enteros.
  await has(/~5:00/)
  // Pasan 90 segundos: el reloj del panel baja la cuenta.
  await clock.advance(90_000)
  const seen = await ui.find({ type: 'Text', text: /~\d/ })
  expect(seen?.text).toBe('~3:30')
  await has(/24% · 2h 13m/)
  await has(/^7%$/)
  await ui.press({ key: 'compact' })
  expect(compacted).toBe(1)
  await ui.unmount()
})

test('el caché dura lo que dice promptCacheTtl en la configuración', async ($, on) => {
  on('command.register', () => ({ value: { command: 'panel' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  mock.clock(on, { now: 1_000_000 })
  on('settings.read', () => ({ value: { promptCacheTtl: '1h' } as never }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/tmp/demo' }))
  on('session.model', () => ({ value: 'opus' }))
  on('env.get', () => ({ value: undefined }))
  on('process.run', () => ({
    value: {
      exitCode: 128,
      stdout: '',
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] },
  }))
  on('session.measure', (_, e) => ({ changed: e.changed }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.measure({
    context: { tokens: 50_000, window: 200_000, percent: 25 },
    rateLimits: [],
    changed: ['context'],
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const seen = await ui.find({ type: 'Text', text: /~\d/ })
  expect(seen?.text).toBe('~1h 00m')
  await ui.unmount()
})

test('la pestaña GIT muestra cambios y commits', async ($, on) => {
  on('command.register', () => ({ value: { command: 'panel' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  const clock = mock.clock(on, { now: 1_000_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/tmp/demo' }))
  on('session.model', () => ({ value: 'opus' }))
  on('env.get', () => ({ value: undefined }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] },
  }))
  on('process.run', (_, e) => {
    const stdout = e.argv.includes('status')
      ? ' M hooks/register.tsx\n?? notas.md\n'
      : e.argv.includes('log')
        ? 'a1b2c3d\t1000\tPrimer commit\n'
        : 'main\n'

    return {
      value: {
        exitCode: 0,
        stdout,
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const has = async (text: RegExp) =>
    expect(await ui.find({ type: 'Text', text })).toBeDefined()

  // Empieza en MAIN; el botón GIT cambia de vista.
  await has(/Contexto/)
  await ui.press({ key: 'tab-git' })
  await has(/Cambios · 2/)
  await has(/hooks\/register\.tsx/)
  await has(/\?\? notas\.md/)
  await has(/a1b2c3d Primer commit/)
  expect(await ui.find({ type: 'Text', text: /Contexto/ })).toBeUndefined()
  await ui.unmount()
})

test('los límites llevan barra: verde, naranja desde 70 % y rojo desde 80 %', async ($, on) => {
  on('command.register', () => ({ value: { command: 'panel' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  mock.clock(on, { now: 1_000_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/tmp/demo' }))
  on('session.model', () => ({ value: 'opus' }))
  on('env.get', () => ({ value: undefined }))
  on('process.run', () => ({
    value: {
      exitCode: 128,
      stdout: '',
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] },
  }))
  on('session.measure', (_, e) => ({ changed: e.changed }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  // bodyColumns 44 deja 40 celdas de barra.
  const cases = [
    { five: 50, week: 69, fiveColor: 'success', weekColor: 'success' },
    { five: 70, week: 79, fiveColor: 'warning', weekColor: 'warning' },
    { five: 80, week: 95, fiveColor: 'error', weekColor: 'error' },
  ]
  for (const one of cases) {
    await $.session.measure({
      context: { window: 200_000 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: one.five },
        { kind: 'seven_day', percentUsed: one.week },
        { kind: 'spend_limit', percentUsed: 10 },
      ],
      changed: ['rateLimits'],
    })

    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    const cells = (percent: number) => Math.round((percent / 100) * 40)
    const fiveBar = await ui.find({
      type: 'Text',
      text: new RegExp(`^━{${cells(one.five)}}$`),
    })
    const weekBar = await ui.find({
      type: 'Text',
      text: new RegExp(`^━{${cells(one.week)}}$`),
    })

    expect(fiveBar?.props?.color).toBe(one.fiveColor)
    expect(weekBar?.props?.color).toBe(one.weekColor)
    await ui.unmount()
  }
})

test('la barra del caché se llena con el tiempo: naranja al 70 % y roja al 90 %', async ($, on) => {
  on('command.register', () => ({ value: { command: 'panel' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  const clock = mock.clock(on, { now: 1_000_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/tmp/demo' }))
  on('session.model', () => ({ value: 'opus' }))
  on('env.get', () => ({ value: undefined }))
  on('process.run', () => ({
    value: {
      exitCode: 128,
      stdout: '',
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] },
  }))
  on('session.measure', (_, e) => ({ changed: e.changed }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.measure({
    context: { tokens: 50_000, window: 200_000, percent: 25 },
    rateLimits: [],
    changed: ['context'],
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // bodyColumns 44 deja 40 celdas; el caché dura 5 minutos. La barra de
  // contexto (25 %) mide 10 celdas, así que ningún largo de aquí choca con ella.
  const barOf = async (cells: number) =>
    ui.find({ type: 'Text', text: new RegExp(`^━{${cells}}$`) })

  // Pasa la mitad: 20 celdas, verde.
  await clock.advance(150_000)
  expect((await barOf(20))?.props?.color).toBe('success')
  // 3:30 de 5:00 es el 70 %: naranja.
  await clock.advance(60_000)
  expect((await barOf(28))?.props?.color).toBe('warning')
  // 4:30 es el 90 %: rojo.
  await clock.advance(60_000)
  expect((await barOf(36))?.props?.color).toBe('error')
  // Se acabó: barra llena y "frío". Con la barra llena, el texto que la
  // envuelve mide lo mismo, así que aquí solo se comprueba el largo.
  await clock.advance(60_000)
  expect(await barOf(40)).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /frío/ })).toBeDefined()
  await ui.unmount()
})

test('MAIN lista los servidores MCP y los archivos con cambios', async ($, on) => {
  on('command.register', () => ({ value: { command: 'panel' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  mock.clock(on, { now: 1_000_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/tmp/demo' }))
  on('session.model', () => ({ value: 'opus' }))
  on('env.get', () => ({ value: undefined }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] },
  }))
  on('tool.list', () => ({
    value: [
      { name: 'Bash', description: '', mcp: false },
      { name: 'mcp__engram__mem_save', description: '', mcp: true },
      { name: 'mcp__engram__mem_search', description: '', mcp: true },
      { name: 'mcp__easel__chart', description: '', mcp: true },
    ],
  }))
  on('process.run', (_, e) => {
    const stdout = e.argv.includes('status')
      ? ' M hooks/register.tsx\n?? notas.md\n'
      : e.argv.includes('log')
        ? 'a1b2c3d\t1000\tPrimer commit\n'
        : 'main\n'

    return {
      value: {
        exitCode: 0,
        stdout,
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const has = async (text: RegExp) =>
    expect(await ui.find({ type: 'Text', text })).toBeDefined()

  await has(/Contexto/)
  await has(/MCP · 2/)
  await has(/● easel/)
  await has(/^1 tool$/)
  await has(/● engram/)
  await has(/^2 tools$/)
  // Los cambios se ven sin pasar a la pestaña GIT.
  await has(/Cambios · 2/)
  await has(/hooks\/register\.tsx/)
  await has(/\?\? notas\.md/)
  await ui.unmount()
})

test('GIT muestra remoto, stage y stash, y el botón abre lazygit', async ($, on) => {
  const spawned: string[][] = []
  const toasts: string[] = []
  on('command.register', () => ({ value: { command: 'panel' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  mock.clock(on, { now: 1_000_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/tmp/demo' }))
  on('session.model', () => ({ value: 'opus' }))
  on('env.get', () => ({ value: undefined }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] },
  }))
  on('process.run', (_, e) => {
    const stdout = e.argv.includes('status')
      ? '## main...origin/main [ahead 2, behind 1]\nM  listo.ts\n M hooks/register.tsx\n?? notas.md\n'
      : e.argv.includes('log')
        ? 'a1b2c3d\t1000\tPrimer commit\n'
        : e.argv.includes('stash')
          ? 'stash@{0}\t999000\tOn main: a medias\nstash@{1}\t990000\tWIP on main: abc1234 otro\nstash@{2}\t980000\tOn main: viejo\n'
          : 'main\n'
    // De las terminales, solo kitty está instalada.
    const isMissing = e.argv[0] === 'sh' && !['lazygit', 'kitty'].includes(e.argv.at(-1) ?? '')

    return {
      value: {
        exitCode: isMissing ? 1 : 0,
        stdout,
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })
  on('process.spawn', async function* (_, e) {
    spawned.push([...e.argv])

    return { value: { code: 0, signal: null } }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const has = async (text: RegExp) =>
    expect(await ui.find({ type: 'Text', text })).toBeDefined()

  await ui.press({ key: 'tab-git' })
  await has(/Cambios · 3/)
  await has(/↑2 ↓1/)
  await has(/1 listos · 2 sin stage/)
  await has(/^Stash · 3$/)
  await has(/a medias/)
  await ui.press({ key: 'lazygit' })
  expect(spawned).toEqual([['kitty', '-e', 'lazygit', '-p', '/tmp/demo']])
  expect(toasts).toContain('lazygit abierto en kitty.')
  await ui.unmount()
})

const OK = {
  exitCode: 0,
  stderr: '',
  isStdoutTruncated: false,
  isStderrTruncated: false,
}

/** Lo común de los motores falsos de git: la sesión y la interfaz. */
const baseEngine = (on: On) => {
  on('command.register', () => ({ value: { command: 'panel' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/tmp/demo' }))
  on('session.model', () => ({ value: 'opus' }))
  on('env.get', () => ({ value: undefined }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] },
  }))
}

test('Cambios muestra las líneas por archivo y los totales', async ($, on) => {
  baseEngine(on)
  mock.clock(on, { now: 1_000_000 })
  on('process.run', (_, e) => {
    const stdout = e.argv.includes('status')
      ? ' M hooks/register.tsx\n M imagen.png\n?? notas.md\n'
      : e.argv.includes('--numstat')
        ? '12\t3\thooks/register.tsx\n-\t-\timagen.png\n'
        : e.argv.includes('log')
          ? ''
          : 'main\n'

    return { value: { ...OK, stdout } }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const has = async (text: RegExp) =>
    expect(await ui.find({ type: 'Text', text })).toBeDefined()

  await has(/Cambios · 3  \+12 −3/)
  await has(/^\+12$/)
  await has(/^−3$/)
  // El archivo sin seguimiento y el binario salen sin números.
  expect(await ui.find({ type: 'Text', text: /^\+0$/ })).toBeUndefined()
  await ui.unmount()
})

test('sin commits el numstat falla y Cambios sale sin números', async ($, on) => {
  baseEngine(on)
  mock.clock(on, { now: 1_000_000 })
  on('process.run', (_, e) => {
    if (e.argv.includes('--numstat')) {
      return { value: { ...OK, exitCode: 128, stdout: '' } }
    }

    return {
      value: {
        ...OK,
        stdout: e.argv.includes('status') ? '?? nuevo.ts\n' : e.argv.includes('log') ? '' : 'main\n',
      },
    }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /Cambios/ }))?.text).toBe('Cambios · 1')
  await ui.unmount()
})

test('git se relee tras un Edit, con freno de un segundo', async ($, on) => {
  baseEngine(on)
  const clock = mock.clock(on, { now: 1_000_000 })
  let statuses = 0
  on('tool.call', () => ({ result: {} }))
  on('process.run', (_, e) => {
    if (e.argv.includes('status')) statuses += 1

    return { value: { ...OK, stdout: e.argv.includes('status') ? ' M a.ts\n' : 'main\n' } }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const before = statuses

  await $.tool.call({ tool: 'Edit', file_path: '/tmp/demo/a.ts', old_string: 'a', new_string: 'b' })
  expect(statuses).toBe(before + 1)
  // Dentro del mismo segundo no hay otra relectura.
  await $.tool.call({ tool: 'Edit', file_path: '/tmp/demo/a.ts', old_string: 'b', new_string: 'c' })
  expect(statuses).toBe(before + 1)
  await clock.advance(1500)
  await $.tool.call({ tool: 'Bash', command: 'git add .' })
  expect(statuses).toBe(before + 2)
})

test('los commits llevan la hora relativa y ↑ si faltan por subir', async ($, on) => {
  baseEngine(on)
  // Ahora son 2 h y 1 min después del commit más nuevo.
  mock.clock(on, { now: 1_000_000 + 2 * 3_600_000 + 60_000 })
  on('process.run', (_, e) => {
    const stdout = e.argv.includes('status')
      ? '## main...origin/main [ahead 1]\n'
      : e.argv.includes('log')
        ? 'aaa1111\t1000\tNuevo\nbbb2222\t-251000\tViejo\n'
        : e.argv.includes('--abbrev-commit')
          ? 'aaa1111\n'
          : 'main\n'

    return { value: { ...OK, stdout } }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-git' })
  const has = async (text: RegExp) =>
    expect(await ui.find({ type: 'Text', text })).toBeDefined()

  await has(/aaa1111 ↑ Nuevo/)
  await has(/bbb2222 Viejo/)
  await has(/^2h$/)
  await has(/^3d$/)
  await ui.unmount()
})

test('el botón fetch hace git fetch con tope de 30 s y avisa', async ($, on) => {
  baseEngine(on)
  mock.clock(on, { now: 1_000_000 })
  const toasts: string[] = []
  const fetches: { argv: readonly string[]; timeoutMs?: number }[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('process.run', (_, e) => {
    if (e.argv.includes('fetch')) {
      fetches.push({ argv: e.argv, ...(e.init?.timeoutMs === undefined ? {} : { timeoutMs: e.init.timeoutMs }) })
    }

    return { value: { ...OK, stdout: 'main\n' } }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-git' })
  await ui.press({ key: 'fetch' })
  expect(fetches).toEqual([{ argv: ['git', 'fetch'], timeoutMs: 30_000 }])
  expect(toasts).toContain('Fetch hecho.')
  await ui.unmount()
})

/** Un motor falso con medición de contexto, para las pruebas de caché y sesión. */
const measuredEngine = (on: On) => {
  baseEngine(on)
  on('process.run', () => ({ value: { ...OK, exitCode: 128, stdout: '' } }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
}

const turn = (agentId: string | undefined, read: number, input: number) =>
  ({
    answer: 'listo',
    durationMs: 10,
    isAborted: false,
    turnId: 't',
    reason: 'answer',
    ...(agentId === undefined ? {} : { agentId }),
    usage: {
      model: 'opus',
      input_tokens: input,
      output_tokens: 10,
      cache_read_input_tokens: read,
      cache_creation_input_tokens: 0,
    },
  }) as const

const measure = {
  context: { tokens: 50_000, window: 200_000, percent: 25 },
  rateLimits: [],
  changed: ['context' as const],
}

test('un toast avisa una sola vez cuando al caché le queda 1 minuto', async ($, on) => {
  measuredEngine(on)
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  const clock = mock.clock(on, { now: 1_000_000 })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.measure(measure)
  await clock.advance(200_000)
  expect(toasts).toEqual([])
  await clock.advance(50_000)
  expect(toasts).toEqual(['El caché vence en 1:00.'])
  await clock.advance(30_000)
  expect(toasts).toHaveLength(1)
  // Llega otra respuesta: el aviso se rearma.
  await $.session.measure(measure)
  await clock.advance(245_000)
  expect(toasts).toHaveLength(2)
})

test('con un caché de 1 h el aviso sale a los 5 minutos', { options: { cache: '1h' } }, async ($, on) => {
  measuredEngine(on)
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  const clock = mock.clock(on, { now: 1_000_000 })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.measure(measure)
  await clock.advance(3_000_000)
  expect(toasts).toEqual([])
  await clock.advance(300_000)
  expect(toasts).toEqual(['El caché vence en 5:00.'])
})

test('con cacheAlert en off no hay toast', { options: { cacheAlert: 'off' } }, async ($, on) => {
  measuredEngine(on)
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  const clock = mock.clock(on, { now: 1_000_000 })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.measure(measure)
  await clock.advance(280_000)
  expect(toasts).toEqual([])
})

test('Caché muestra el porcentaje leído, solo del hilo principal', async ($, on) => {
  measuredEngine(on)
  mock.clock(on, { now: 1_000_000 })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^—$/ }))?.text).toBe('—')

  await $.turn.complete(turn(undefined, 800, 200))
  // Un subagente no cuenta.
  await $.turn.complete(turn('a1', 0, 5000))
  await ui.unmount()

  const again = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const value = await again.find({ type: 'Text', text: /^80%$/ })
  expect(value?.props?.color).toBe('success')
  await again.unmount()

  await $.turn.complete(turn(undefined, 0, 1000))
  const third = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // 800 de 2000: 40 %.
  expect((await third.find({ type: 'Text', text: /^40%$/ }))?.props?.color).toBe('warning')
  await third.unmount()
})

test('Status muestra el tiempo de la sesión', async ($, on) => {
  measuredEngine(on)
  const clock = mock.clock(on, { now: 1_000_000 })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await clock.advance(95_000)
  expect(await ui.find({ type: 'Text', text: /^Sesión$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^1:35$/ })).toBeDefined()
  await ui.unmount()
})

test('el costo de Contexto lleva lo que subió el último turno', async ($, on) => {
  baseEngine(on)
  on('process.run', () => ({ value: { ...OK, exitCode: 128, stdout: '' } }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  mock.clock(on, { now: 1_000_000 })
  const usage = { startedAt: 0, context: { window: 200_000 }, rateLimits: [] }

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.measure({ ...usage, cost: { usd: 1.213 }, changed: ['cost'] })
  await $.session.measure({ ...usage, cost: { usd: 1.234 }, changed: ['cost'] })

  // bodyColumns 60 deja sitio para el costo y la diferencia.
  const ui = await $.ui.mount({
    ...PANE,
    props: { ...PANE.props, bodyColumns: 60 },
    surface: 'terminal',
  })
  expect(await ui.find({ type: 'Text', text: /\$1\.234/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^ \(\+\$0\.021\)$/ })).toBeDefined()
  await ui.unmount()
})

/** Un motor falso con límites, un servidor MCP y un archivo con cambios. */
const sectionsEngine = (on: On) => {
  on('command.register', () => ({ value: { command: 'panel' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/tmp/demo' }))
  on('session.model', () => ({ value: 'opus' }))
  on('env.get', () => ({ value: undefined }))
  mock.clock(on, { now: 1_000_000 })
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { window: 200_000 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 20 }],
    },
  }))
  on('tool.list', () => ({
    value: [{ name: 'mcp__engram__mem_save', description: '', mcp: true }],
  }))
  on('process.run', (_, e) => ({
    value: {
      ...OK,
      stdout: e.argv.includes('status') ? ' M a.ts\n' : e.argv.includes('log') ? '' : 'main\n',
    },
  }))
}

const SECTIONS = [
  { option: 'showLimits', text: /^Límites$/ },
  { option: 'showMcp', text: /MCP · 1/ },
  { option: 'showChanges', text: /Cambios · 1/ },
] as const

for (const one of SECTIONS) {
  test(`${one.option} en off apaga esa sección de MAIN`, { options: { [one.option]: 'off' } }, async ($, on) => {
    sectionsEngine(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: one.text })).toBeUndefined()
    // Las demás secciones siguen.
    for (const other of SECTIONS.filter(item => item.option !== one.option)) {
      expect(await ui.find({ type: 'Text', text: other.text })).toBeDefined()
    }
    await ui.press({ key: 'tab-git' })
    // La pestaña GIT siempre muestra Cambios.
    expect(await ui.find({ type: 'Text', text: /Cambios · 1/ })).toBeDefined()
    await ui.unmount()
  })
}

test('los subagentes llevan su duración y los terminados se limpian a los 10 minutos', async ($, on) => {
  measuredEngine(on)
  const clock = mock.clock(on, { now: 1_000_000 })
  let live: { id: string; type: string; description: string; status: string }[] = [
    { id: 'a1', type: 'Explore', description: 'Buscar rutas', status: 'running' },
  ]
  on('agent.list', () => ({ value: live as never }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.turn.complete(turn('a1', 0, 100))
  await clock.advance(65_000)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-tasks' })
  // Activo: el tiempo corre con el reloj del panel.
  expect(await ui.find({ type: 'Text', text: /▲ 100 ▼ 10 1:05/ })).toBeDefined()
  await clock.advance(5000)
  expect(await ui.find({ type: 'Text', text: /▲ 100 ▼ 10 1:10/ })).toBeDefined()

  // Desaparece de la lista en vivo: queda con lo que duró.
  live = []
  await $.turn.complete(turn('a2', 0, 1))
  await clock.advance(120_000)
  expect(await ui.find({ type: 'Text', text: /▲ 100 ▼ 10 1:10/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Explore/ })).toBeDefined()

  // Pasados 10 minutos desde que terminó, el siguiente sync lo quita.
  await clock.advance(500_000)
  await $.turn.complete(turn('a2', 0, 1))
  expect(await ui.find({ type: 'Text', text: /Explore/ })).toBeUndefined()
  await ui.unmount()
})

test('un MCP que deja de dar herramientas sale en rojo con ○', async ($, on) => {
  baseEngine(on)
  mock.clock(on, { now: 1_000_000 })
  on('process.run', () => ({ value: { ...OK, exitCode: 128, stdout: '' } }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  let tools = [
    { name: 'mcp__engram__mem_save', description: '', mcp: true },
    { name: 'mcp__engram__mem_search', description: '', mcp: true },
    { name: 'mcp__easel__chart', description: '', mcp: true },
  ]
  on('tool.list', () => ({ value: tools }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /MCP · 2$/ })).toBeDefined()
  await ui.unmount()

  // engram se cae: queda recordado, en rojo y sin contarse como activo.
  tools = [{ name: 'mcp__easel__chart', description: '', mcp: true }]
  await $.session.measure({ ...measure, changed: ['context'] })

  const again = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await again.find({ type: 'Text', text: /MCP · 1 de 2/ })).toBeDefined()
  const down = await again.find({ type: 'Text', text: /engram/ })
  expect(down?.props?.color).toBe('error')
  expect(await again.find({ type: 'Text', text: /○ / })).toBeDefined()
  expect(await again.find({ type: 'Text', text: /^sin herramientas$/ })).toBeDefined()
  expect(await again.find({ type: 'Text', text: /● / })).toBeDefined()
  await again.unmount()
})

/** Un motor falso cuyo `git status` devuelve las líneas dadas. */
const statusEngine = (on: On, status: string, numstat = '') => {
  baseEngine(on)
  mock.clock(on, { now: 1_000_000 })
  on('process.run', (_, e) => {
    const stdout = e.argv.includes('status')
      ? status
      : e.argv.includes('--numstat')
        ? numstat
        : e.argv.includes('log')
          ? ''
          : 'main\n'

    return { value: { ...OK, stdout } }
  })
}

test('GIT agrupa los cambios en stage, sin stage y sin seguimiento', async ($, on) => {
  statusEngine(
    on,
    'M  listo.ts\nMM ambos.ts\n M suelto.ts\n?? nuevo.md\n?? otro.md\n',
    '1\t0\tlisto.ts\n5\t2\tambos.ts\n3\t1\tsuelto.ts\n',
  )
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-git' })
  const has = async (text: RegExp) =>
    expect(await ui.find({ type: 'Text', text })).toBeDefined()

  await has(/^Cambios · 5  \+9 −3$/)
  // 'MM' cuenta en los dos primeros grupos.
  await has(/^En stage · 2$/)
  await has(/^Sin stage · 2$/)
  await has(/^Sin seguimiento · 2$/)
  await has(/^\+6 −2$/)
  await has(/^\+8 −3$/)
  await has(/listo\.ts/)
  await has(/suelto\.ts/)
  await has(/\?\? nuevo\.md/)
  expect(await ui.find({ type: 'Text', text: /ambos\.ts/ })).toBeDefined()
  await ui.unmount()
})

test('GIT no muestra los grupos vacíos y dice si no hay cambios', async ($, on) => {
  statusEngine(on, '?? nuevo.md\n')
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-git' })
  expect(await ui.find({ type: 'Text', text: /^Sin seguimiento · 1$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /En stage|Sin stage/ })).toBeUndefined()
  await ui.unmount()
})

test('GIT con el árbol limpio dice Sin cambios pendientes', async ($, on) => {
  statusEngine(on, '')
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-git' })
  expect(await ui.find({ type: 'Text', text: /Sin cambios pendientes\./ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /En stage|Sin stage|seguimiento/ })).toBeUndefined()
  await ui.unmount()
})

test('GIT muestra 15 por grupo y "… y N más"; MAIN sigue en 6', async ($, on) => {
  const many = Array.from({ length: 20 }, (_, index) => ` M f${index}.ts\n`).join('')
  statusEngine(on, many)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // MAIN: 6 archivos, lista plana y el total en el título.
  expect(await ui.find({ type: 'Text', text: /^Cambios · 20$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /f5\.ts/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /f6\.ts/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^… y 14 más$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Sin stage/ })).toBeUndefined()

  await ui.press({ key: 'tab-git' })
  expect(await ui.find({ type: 'Text', text: /^Sin stage · 20$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /f14\.ts/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /f15\.ts/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^… y 5 más$/ })).toBeDefined()
  await ui.unmount()
})

/** Un motor falso de git con un diff por archivo; guarda cada comando `git diff` pedido. */
const diffEngine = (on: On, status: string, diff: (argv: readonly string[]) => string) => {
  const asked: (readonly string[])[] = []
  baseEngine(on)
  mock.clock(on, { now: 1_000_000 })
  on('process.run', (_, e) => {
    const isDiff = e.argv[0] === 'git' && e.argv.includes('diff') && e.argv.includes('-U0')
    if (isDiff) asked.push(e.argv)
    const stdout = isDiff
      ? diff(e.argv)
      : e.argv.includes('status')
        ? status
        : e.argv.includes('log') || e.argv.includes('--numstat')
          ? ''
          : 'main\n'

    return { value: { ...OK, exitCode: isDiff && e.argv.includes('--no-index') ? 1 : 0, stdout } }
  })

  return asked
}

const HEADERS =
  'diff --git a/a.ts b/a.ts\nindex 111..222 100644\n--- a/a.ts\n+++ b/a.ts\n'

test('pulsar un archivo de GIT despliega su diff coloreado y volver a pulsarlo lo pliega', async ($, on) => {
  const asked = diffEngine(
    on,
    'M  a.ts\n M b.ts\n',
    () => `${HEADERS}@@ -1,2 +1,2 @@\n-viejo\n+nuevo\n`,
  )
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-git' })
  expect(await ui.find({ type: 'Text', text: /^\+nuevo$/ })).toBeUndefined()

  await ui.press({ key: 'stage:a.ts' })
  expect(asked).toEqual([['git', 'diff', '-U0', '--no-color', '--cached', '--', 'a.ts']])
  expect((await ui.find({ type: 'Text', text: /^\+nuevo$/ }))?.props?.color).toBe('success')
  expect((await ui.find({ type: 'Text', text: /^-viejo$/ }))?.props?.color).toBe('error')
  expect((await ui.find({ type: 'Text', text: /^@@ -1,2/ }))?.props?.dimColor).toBe(true)
  // Las cabeceras de git no salen.
  expect(await ui.find({ type: 'Text', text: /^(diff --git|index|---|\+\+\+)/ })).toBeUndefined()

  // Sin stage usa el diff sin --cached.
  await ui.press({ key: 'unstaged:b.ts' })
  expect(asked.at(-1)).toEqual(['git', 'diff', '-U0', '--no-color', '--', 'b.ts'])

  await ui.press({ key: 'stage:a.ts' })
  await ui.press({ key: 'unstaged:b.ts' })
  expect(await ui.find({ type: 'Text', text: /^\+nuevo$/ })).toBeUndefined()
  await ui.unmount()
})

test('el diff resumido guarda 20 líneas y dice cuántas faltan', async ($, on) => {
  const body = Array.from({ length: 27 }, (_, index) => `+línea ${index}\n`).join('')
  diffEngine(on, ' M a.ts\n', () => `${HEADERS}@@ -0,0 +1,27 @@\n${body}`)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-git' })
  await ui.press({ key: 'unstaged:a.ts' })
  expect(await ui.find({ type: 'Text', text: /^\+línea 19$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^\+línea 20$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^… y 7 líneas más$/ })).toBeDefined()
  await ui.unmount()
})

test('un archivo sin seguimiento usa git diff --no-index y acepta el código 1', async ($, on) => {
  const asked = diffEngine(on, '?? nuevo.md\n', () => 'diff --git a/nuevo.md b/nuevo.md\nnew file mode 100644\n--- /dev/null\n+++ b/nuevo.md\n@@ -0,0 +1 @@\n+hola\n')
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-git' })
  await ui.press({ key: 'untracked:nuevo.md' })
  expect(asked).toEqual([
    ['git', 'diff', '--no-index', '-U0', '--no-color', '--', '/dev/null', 'nuevo.md'],
  ])
  expect(await ui.find({ type: 'Text', text: /^\+hola$/ })).toBeDefined()
  await ui.unmount()
})

test('un binario o un diff vacío dicen Sin vista previa.', async ($, on) => {
  diffEngine(on, ' M foto.png\n', () => 'diff --git a/foto.png b/foto.png\nBinary files a/foto.png and b/foto.png differ\n')
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-git' })
  await ui.press({ key: 'unstaged:foto.png' })
  expect(await ui.find({ type: 'Text', text: /^Sin vista previa\.$/ })).toBeDefined()
  await ui.unmount()
})

test('la tecla d abre el diff completo del último archivo desplegado, o avisa', async ($, on) => {
  const spawned: string[][] = []
  const toasts: string[] = []
  diffEngine(on, ' M a.ts\n?? nuevo.md\n', () => `${HEADERS}@@ -1 +1 @@\n-a\n+b\n`)
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('process.spawn', async function* (_, e) {
    spawned.push([...e.argv])

    return { value: { code: 0, signal: null } }
  })
  // El motor falso dice que todo comando existe: se usa la primera terminal, ghostty.
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-git' })
  await ui.press({ key: 'diff' })
  expect(toasts).toContain('Despliega un archivo en GIT para ver su diff.')
  expect(spawned).toEqual([])

  await ui.press({ key: 'unstaged:a.ts' })
  await ui.press({ key: 'diff' })
  expect(spawned).toHaveLength(1)
  const [terminal, flag, ...command] = spawned[0] ?? []
  expect(terminal).toBe('ghostty')
  expect(flag).toBe('-e')
  expect(command[0]).toBe('sh')
  expect(command[1]).toBe('-c')
  expect(command[2]).toContain('git diff --color=always HEAD -- "$1" | if command -v delta')
  expect(command.slice(3)).toEqual(['sh', 'a.ts'])

  await ui.press({ key: 'untracked:nuevo.md' })
  await ui.press({ key: 'diff' })
  expect(spawned[1]?.at(-3)).toContain('git diff --no-index --color=always -- /dev/null "$1"')
  expect(spawned[1]?.at(-1)).toBe('nuevo.md')
  await ui.unmount()
})

/** Lo que el listado de sesiones devuelve: dos usadas y una vacía. */
const SESSIONS_OUT = [
  'F\taaa.jsonl\t940',
  '{"type":"ai-title","aiTitle":"Pestaña de sesiones","sessionId":"aaa"}',
  '{"type":"last-prompt","lastPrompt":"agrega la pestaña","sessionId":"aaa"}',
  '{"type":"cost-state","totalCostUSD":1.8223,"totalDuration":674000,"totalLinesAdded":69,"totalLinesRemoved":2}',
  'F\tbbb.jsonl\t400',
  '{"type":"last-prompt","lastPrompt":"arregla el diff","sessionId":"bbb"}',
  'F\tvacia.jsonl\t300',
  '',
].join('\n')

/** Un motor falso con sesiones guardadas; guarda cada comando `sh` pedido. */
const sessionsEngine = (on: On, prompts = '') => {
  const asked: (readonly string[])[] = []
  on('command.register', () => ({ value: { command: 'panel' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/tmp/demo' }))
  on('session.model', () => ({ value: 'opus' }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] },
  }))
  mock.clock(on, { now: 1_000_000 })
  on('session.root', () => ({ value: '/home/ana/mi proyecto' }))
  on('session.id', () => ({ value: 'bbb' }))
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/ana' : undefined }))
  on('process.run', (_, e) => {
    if (e.argv[0] !== 'sh' || e.argv[1] !== '-c') return { value: { ...OK, exitCode: 128, stdout: '' } }
    asked.push(e.argv)
    const script = e.argv[2] ?? ''

    return {
      value: {
        ...OK,
        stdout: script.includes('ls -t') ? SESSIONS_OUT : script.includes('promptSource') ? prompts : '',
      },
    }
  })

  return asked
}

test('SESIONES lista las sesiones de la carpeta y despliega sus datos', async ($, on) => {
  const asked = sessionsEngine(on)
  on('store.get', () => ({ value: { aaa: 'Se añadió la pestaña.' } }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-sessions' })
  const has = async (text: RegExp) =>
    expect(await ui.find({ type: 'Text', text })).toBeDefined()

  // La carpeta de transcripciones sale de la raíz de la sesión.
  // (Antes de abrir la pestaña ya se leyó el modo de permisos, que también usa `sh`.)
  expect(asked.find(argv => argv[2]?.includes('ls -t'))?.[4]).toBe(
    '/home/ana/.claude/projects/-home-ana-mi-proyecto',
  )
  // La vacía no sale; la que corre lleva "esta" y la otra su hora.
  await has(/^Sesiones · 2$/)
  await has(/○ Pestaña de sesiones\s+1m$/)
  await has(/● arregla el diff\s+esta$/)

  expect(await ui.find({ type: 'Text', text: /agrega la pestaña/ })).toBeUndefined()
  await ui.press({ key: 'session:aaa' })
  await has(/^› agrega la pestaña$/)
  await has(/^\$1\.82 · 11:14 · \+69 −2$/)
  // El resumen guardado en otra sesión vuelve del store.
  await has(/^Se añadió la pestaña\.$/)
  expect(await ui.find({ type: 'Button', key: 'resume' })).toBeDefined()

  // La sesión que corre no se reanuda.
  await ui.press({ key: 'session:bbb' })
  expect(await ui.find({ type: 'Button', key: 'resume' })).toBeUndefined()
  await ui.unmount()
})

test('Resumir pide un resumen al modelo rápido con los prompts y lo guarda', async ($, on) => {
  const typed = (content: unknown, extra = '') =>
    `{"type":"user","promptSource":"typed"${extra},"message":{"role":"user","content":${JSON.stringify(content)}}}`
  sessionsEngine(
    on,
    [
      typed('agrega una pestaña de sesiones'),
      typed('<command-name>/model</command-name>'),
      typed('de un subagente', ',"isSidechain":true'),
      typed([{ type: 'text', text: 'ahora los resúmenes' }]),
      '',
    ].join('\n'),
  )
  const requests: { model: string; prompt: unknown }[] = []
  const saved: unknown[] = []
  on('store.get', () => ({ value: undefined }))
  on('store.set', (_, e) => {
    saved.push(e.value)

    return { value: undefined }
  })
  on('model.complete', (_, e) => {
    requests.push({ model: e.model, prompt: e.prompt })

    return {
      value: {
        isAnswered: true as const,
        text: ' Se pidió una pestaña de sesiones. ',
        usage: {
          model: 'haiku',
          input_tokens: 1,
          output_tokens: 1,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    }
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-sessions' })
  await ui.press({ key: 'session:aaa' })
  await ui.press({ key: 'summarize' })

  expect(requests).toHaveLength(1)
  expect(requests[0]?.model).toBe('haiku')
  // Solo los prompts escritos del hilo principal, numerados.
  expect(requests[0]?.prompt).toBe(
    'Título: Pestaña de sesiones\n\nPrompts:\n1. agrega una pestaña de sesiones\n2. ahora los resúmenes',
  )
  expect(await ui.find({ type: 'Text', text: /^Se pidió una pestaña de sesiones\.$/ })).toBeDefined()
  expect(saved).toEqual([{ aaa: 'Se pidió una pestaña de sesiones.' }])
  await ui.unmount()
})

test('si el modelo no responde, Resumir avisa y no guarda nada', async ($, on) => {
  sessionsEngine(on)
  const toasts: string[] = []
  on('store.get', () => ({ value: undefined }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('model.complete', () => ({
    value: {
      isAnswered: false as const,
      reason: 'empty-reply' as const,
      usage: {
        model: 'haiku',
        input_tokens: 1,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    },
  }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-sessions' })
  await ui.press({ key: 'session:aaa' })
  await ui.press({ key: 'summarize' })
  expect(toasts).toContain('No se pudo resumir la sesión.')
  expect(await ui.find({ type: 'Text', text: /Resumiendo/ })).toBeUndefined()
  await ui.unmount()
})

test('Reanudar abre claude --resume con el id en una terminal', async ($, on) => {
  sessionsEngine(on)
  const spawned: string[][] = []
  on('store.get', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('process.spawn', async function* (_, e) {
    spawned.push([...e.argv])

    return { value: { code: 0, signal: null } }
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-sessions' })
  await ui.press({ key: 'session:aaa' })
  await ui.press({ key: 'resume' })
  expect(spawned).toHaveLength(1)
  expect(spawned[0]?.slice(-3)).toEqual(['claude', '--resume', 'aaa'])
  await ui.unmount()
})

/**
 * Un motor falso de git y gh. `answer` responde por comando (un texto es su
 * stdout); lo que no responde da `main` o, para `git log`, nada. Devuelve cada
 * comando pedido y el reloj falso.
 */
const repoEngine = (
  on: On,
  answer: (argv: readonly string[]) => string | { stdout?: string; stderr?: string; exitCode?: number } | undefined,
) => {
  const calls: (readonly string[])[] = []
  baseEngine(on)
  const clock = mock.clock(on, { now: 1_000_000 })
  on('process.run', (_, e) => {
    calls.push(e.argv)
    const got = answer(e.argv)
    const out = typeof got === 'string' ? { stdout: got } : (got ?? {})

    return { value: { ...OK, stdout: e.argv.includes('log') ? '' : 'main\n', ...out } }
  })

  return { calls, clock }
}

const toastsOf = (on: On) => {
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })

  return toasts
}

test('un renombrado en stage sale con la ruta nueva y sus líneas, y su botón usa la ruta nueva', async ($, on) => {
  const { calls } = repoEngine(on, argv =>
    argv.includes('status')
      ? 'R  lib/viejo/x.ts -> lib/x.ts\nR  "a b.ts" -> "src/c d.ts"\n'
      : argv.includes('--numstat')
        ? '2\t1\tlib/{viejo => }/x.ts\n0\t0\ta b.ts => src/c d.ts\n'
        : undefined,
  )
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-git' })
  expect(calls.find(argv => argv.includes('status'))).toEqual([
    'git', '-c', 'core.quotePath=false', 'status', '--porcelain', '-b',
  ])
  expect(calls.find(argv => argv.includes('--numstat'))).toEqual([
    'git', '-c', 'core.quotePath=false', 'diff', '--numstat', '-M', 'HEAD',
  ])
  expect(await ui.find({ type: 'Text', text: /^R  lib\/x\.ts/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\+2 −1/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /viejo/ })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'stage:lib/x.ts' })).toBeDefined()
  // La ruta con comillas llega sin ellas.
  expect(await ui.find({ type: 'Button', key: 'stage:src/c d.ts' })).toBeDefined()
  await ui.unmount()
})

/** Los dos archivos de la prueba de "de Claude": uno se edita, el otro ya estaba sucio. */
const touchedEngine = (on: On) => {
  const engine = repoEngine(on, argv =>
    argv.includes('status')
      ? ' M a.ts\n M b.ts\n'
      : argv.includes('--show-toplevel')
        ? '/tmp/demo\n'
        : undefined,
  )
  toastsOf(on)

  return engine
}

test('un Edit marca el archivo con ✦, cuenta en el título y el botón filtra', async ($, on) => {
  touchedEngine(on)
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/tmp/demo/a.ts', old_string: 'a', new_string: 'b' })
  // Una ruta relativa se toma desde la carpeta de la sesión.
  await $.tool.call({ tool: 'Edit', file_path: 'a.ts', old_string: 'b', new_string: 'c' })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const has = async (text: RegExp) =>
    expect(await ui.find({ type: 'Text', text })).toBeDefined()
  const lacks = async (text: RegExp) =>
    expect(await ui.find({ type: 'Text', text })).toBeUndefined()

  await has(/^Cambios · 2 · 1 de Claude$/)
  await has(/^M ✦a\.ts$/)
  await has(/^M  b\.ts$/)

  await ui.press({ key: 'tab-git' })
  await has(/^M ✦a\.ts/)
  await has(/^M  b\.ts/)
  expect((await ui.find({ type: 'Button', key: 'only-touched' }))?.props?.label).toBe('Solo de Claude')
  await ui.press({ key: 'only-touched' })
  expect((await ui.find({ type: 'Button', key: 'only-touched' }))?.props?.label).toBe('Todos')
  await has(/^M ✦a\.ts/)
  await lacks(/b\.ts/)
  await ui.press({ key: 'only-touched' })
  await has(/^M  b\.ts/)
  await ui.unmount()
})

test('un Edit denegado no cuenta como tocado y sin tocados no hay botón', async ($, on) => {
  touchedEngine(on)
  on('tool.call', () => ({ deny: 'no' }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/tmp/demo/a.ts', old_string: 'a', new_string: 'b' })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /de Claude|✦/ })).toBeUndefined()
  await ui.press({ key: 'tab-git' })
  expect(await ui.find({ type: 'Button', key: 'only-touched' })).toBeUndefined()
  await ui.unmount()
})

/** Una respuesta de `gh pr view` con checks de los dos tipos. */
const PR_JSON = JSON.stringify({
  number: 12,
  title: 'Añade la pestaña de sesiones',
  state: 'OPEN',
  isDraft: false,
  url: 'https://github.com/x/y/pull/12',
  reviewDecision: 'CHANGES_REQUESTED',
  statusCheckRollup: [
    { __typename: 'CheckRun', name: 'build', status: 'COMPLETED', conclusion: 'SUCCESS' },
    { __typename: 'CheckRun', name: 'lint', status: 'COMPLETED', conclusion: 'SKIPPED' },
    { __typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'FAILURE' },
    { __typename: 'CheckRun', name: 'e2e', status: 'IN_PROGRESS', conclusion: '' },
    { __typename: 'StatusContext', context: 'ci/deploy', state: 'PENDING' },
    { __typename: 'StatusContext', context: 'ci/legacy', state: 'SUCCESS' },
    { __typename: 'StatusContext', context: 'ci/audit', state: 'ERROR' },
  ],
})

test('GIT muestra el PR con su estado y los checks, y Abrir PR corre gh pr view --web', async ($, on) => {
  const { calls } = repoEngine(on, argv =>
    argv[0] === 'gh' ? (argv.includes('--web') ? '' : PR_JSON) : undefined,
  )
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const has = async (text: RegExp) =>
    expect(await ui.find({ type: 'Text', text })).toBeDefined()
  // En MAIN no se lee ni se dibuja.
  expect(calls.filter(argv => argv[0] === 'gh')).toEqual([])

  await ui.press({ key: 'tab-git' })
  const view = calls.find(argv => argv[0] === 'gh')
  expect(view).toEqual([
    'gh', 'pr', 'view', '--json',
    'number,title,state,isDraft,url,reviewDecision,statusCheckRollup',
  ])
  await has(/^Pull request$/)
  await has(/^#12 Añade la pestaña de sesiones$/)
  await has(/^abierto · piden cambios$/)
  // 3 en verde (build, lint, ci/legacy), 2 fallidos (test, ci/audit), 2 pendientes.
  const checks = await ui.find({ type: 'Text', text: /^✓ 3 ✗ 2 ● 2$/ })
  expect(checks?.props?.color).toBe('error')
  await has(/✗ test/)
  await has(/✗ ci\/audit/)
  await has(/● e2e/)
  await has(/● ci\/deploy/)
  expect(await ui.find({ type: 'Text', text: /build|lint|legacy/ })).toBeUndefined()

  await ui.press({ key: 'open-pr' })
  expect(calls.at(-1)).toEqual(['gh', 'pr', 'view', '--web'])
  await ui.unmount()
})

test('una rama sin PR lo dice; si gh falla no se dibuja nada', async ($, on) => {
  let isNone = true
  repoEngine(on, argv =>
    argv[0] === 'gh'
      ? isNone
        ? { exitCode: 1, stderr: 'no pull requests found for branch "main"' }
        : { exitCode: 1, stderr: 'gh: command not found' }
      : undefined,
  )
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-git' })
  expect(await ui.find({ type: 'Text', text: /^Pull request$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Sin PR para esta rama\.$/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'open-pr' })).toBeUndefined()

  isNone = false
  await ui.press({ key: 'tab-main' })
  await ui.press({ key: 'tab-git' })
  expect(await ui.find({ type: 'Text', text: /Pull request|Sin PR/ })).toBeUndefined()
  await ui.unmount()
})

test('el toast avisa cuando los checks del PR dejan de estar pendientes', async ($, on) => {
  const toasts = toastsOf(on)
  let checks: unknown[] = [
    { name: 'build', status: 'IN_PROGRESS' },
    { name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' },
  ]
  let reads = 0
  const { clock } = repoEngine(on, argv => {
    if (argv[0] !== 'gh') return undefined
    reads += 1

    return JSON.stringify({ number: 7, title: 'T', state: 'OPEN', isDraft: false, url: '', statusCheckRollup: checks })
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-git' })
  expect(reads).toBe(1)
  // Dentro del minuto no se vuelve a leer.
  await clock.advance(30_000)
  expect(reads).toBe(1)
  expect(toasts.filter(text => text.startsWith('Checks'))).toEqual([])

  // Pasado el minuto, con GIT a la vista y checks pendientes, se relee: todo en verde.
  checks = [
    { name: 'build', status: 'COMPLETED', conclusion: 'SUCCESS' },
    { name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' },
  ]
  await clock.advance(35_000)
  expect(reads).toBe(2)
  expect(toasts).toContain('Checks del PR #7: todo en verde.')
  // Ya sin pendientes no se vuelve a leer por el reloj.
  await clock.advance(120_000)
  expect(reads).toBe(2)
  await ui.unmount()
})

test('un check que falla al terminar avisa cuántos fallaron', async ($, on) => {
  const toasts = toastsOf(on)
  let state = 'IN_PROGRESS'
  const { clock } = repoEngine(on, argv =>
    argv[0] === 'gh'
      ? JSON.stringify({
          number: 3,
          title: 'T',
          state: 'OPEN',
          isDraft: true,
          url: '',
          statusCheckRollup: [{ name: 'build', status: state, conclusion: 'FAILURE' }],
        })
      : undefined,
  )
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-git' })
  expect(await ui.find({ type: 'Text', text: /^borrador$/ })).toBeDefined()
  state = 'COMPLETED'
  await clock.advance(65_000)
  expect(toasts).toContain('Checks del PR #3: fallaron 1.')
  await ui.unmount()
})

test('un Bash con git push relee el PR; con otro comando no', async ($, on) => {
  const { calls } = repoEngine(on, argv => (argv[0] === 'gh' ? PR_JSON : undefined))
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const reads = () => calls.filter(argv => argv[0] === 'gh').length

  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(reads()).toBe(0)
  await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
  expect(reads()).toBe(1)
  await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' })
  expect(reads()).toBe(2)
})

test('con showPr en off no se lee ni se dibuja el PR', { options: { showPr: 'off' } }, async ($, on) => {
  const { calls } = repoEngine(on, argv => (argv[0] === 'gh' ? PR_JSON : undefined))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-git' })
  expect(await ui.find({ type: 'Text', text: /Pull request|#12/ })).toBeUndefined()
  expect(calls.filter(argv => argv[0] === 'gh')).toEqual([])
  await ui.unmount()
})

/** La salida de `git worktree list --porcelain` con un worktree principal y uno enlazado. */
const TREES = [
  'worktree /tmp/demo',
  'HEAD aaaaaaaa11111111',
  'branch refs/heads/main',
  '',
  'worktree /tmp/demo-fix',
  'HEAD bbbbbbbb22222222',
  'branch refs/heads/fix/uno',
  '',
  'worktree /tmp/demo-viejo',
  'HEAD cccccccc33333333',
  'detached',
  '',
].join('\n')

test('con más de un worktree GIT los lista y el botón abre lazygit en ese worktree', async ($, on) => {
  const spawned: string[][] = []
  const { calls } = repoEngine(on, argv =>
    argv.includes('--show-toplevel')
      ? '/tmp/demo\n'
      : argv.includes('status')
        ? argv.includes('-b') ? '## main\n' : ''
        : argv.includes('worktree')
        ? TREES
        : argv[0] === 'sh'
          ? argv.at(-1) === 'lazygit' || argv.at(-1) === 'kitty'
            ? ''
            : { exitCode: 1 }
          : undefined,
  )
  toastsOf(on)
  on('process.spawn', async function* (_, e) {
    spawned.push([...e.argv])

    return { value: { code: 0, signal: null } }
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(calls.some(argv => argv.join(' ') === 'git worktree list --porcelain')).toBe(true)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-git' })
  expect(await ui.find({ type: 'Text', text: /^Worktrees · 3$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^● main\s+\/tmp\/demo$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^○ fix\/uno\s+\/tmp\/demo-fix$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^○ \(cccccccc?\)/ })).toBeDefined()

  await ui.press({ key: 'worktree:/tmp/demo-fix' })
  expect(spawned).toEqual([['kitty', '-e', 'lazygit', '-p', '/tmp/demo-fix']])
  await ui.unmount()
})

const treesEngine = (
  on: On,
  porcelain: string,
  statusOf: (cwd: string | undefined) => { stdout?: string; exitCode?: number } | 'throw',
  prune: { stderr?: string; exitCode?: number } = {},
) => {
  const runs: { argv: readonly string[]; cwd?: string }[] = []
  const spawned: string[][] = []
  baseEngine(on)
  mock.clock(on, { now: 1_000_000 })
  on('process.run', (_, e) => {
    runs.push({ argv: e.argv, cwd: e.init?.cwd })
    const text = e.argv.join(' ')
    if (text === 'git status --porcelain') {
      const got = statusOf(e.init?.cwd)
      if (got === 'throw') throw new Error('timeout')

      return { value: { ...OK, ...got } }
    }

    if (text === 'git worktree prune') return { value: { ...OK, ...prune } }

    return {
      value: {
        ...OK,
        stdout: e.argv.includes('--show-toplevel')
          ? '/tmp/demo\n'
          : e.argv.includes('worktree')
            ? porcelain
            : e.argv.includes('log')
              ? ''
              : e.argv[0] === 'sh'
                ? 'lazygit'
                : '## main\n',
      },
    }
  })
  on('process.spawn', async function* (_, e) {
    spawned.push([...e.argv])

    return { value: { code: 0, signal: null } }
  })

  return { runs, spawned, toasts: toastsOf(on) }
}

const treesStatus = (runs: { argv: readonly string[]; cwd?: string }[]) =>
  runs.filter(run => run.argv.join(' ') === 'git status --porcelain').map(run => run.cwd)

test('un worktree con cambios muestra su número y el actual no lanza otro git status', async ($, on) => {
  const { runs } = treesEngine(on, TREES, cwd => (cwd === '/tmp/demo-fix' ? { stdout: ' M a\n?? b\nA  c\n' } : { stdout: '' }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-git' })
  expect(await ui.find({ type: 'Text', text: /^○ fix\/uno ±3\s+\/tmp\/demo-fix$/ })).toBeDefined()
  // El sin cambios no muestra número.
  expect(await ui.find({ type: 'Text', text: /^○ \(cccccccc?\)\s+\/tmp\/demo-viejo$/ })).toBeDefined()
  expect(treesStatus(runs).includes('/tmp/demo')).toBe(false)
  expect(treesStatus(runs)).toContain('/tmp/demo-fix')
  await ui.unmount()
})

test('un worktree bloqueado lleva la marca bloqueado', async ($, on) => {
  const porcelain = TREES.replace('detached\n', 'detached\nlocked razón de prueba\n')
  treesEngine(on, porcelain, () => ({ stdout: '' }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-git' })
  expect(await ui.find({ type: 'Text', text: /^○ \(cccccccc?\) bloqueado\s+\/tmp\/demo-viejo$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^○ fix\/uno\s+\/tmp\/demo-fix$/ })).toBeDefined()
  await ui.unmount()
})

test('un worktree prunable lleva la marca, no corre git status y al pulsarlo avisa sin abrir lazygit', async ($, on) => {
  const porcelain = TREES.replace('detached\n', 'detached\nprunable gitdir file points to non-existent location\n')
  const { runs, spawned, toasts } = treesEngine(on, porcelain, () => ({ stdout: '' }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-git' })
  expect(await ui.find({ type: 'Text', text: /^○ \(cccccccc?\) no existe\s+\/tmp\/demo-viejo$/ })).toBeDefined()
  expect(treesStatus(runs)).not.toContain('/tmp/demo-viejo')

  await ui.press({ key: 'worktree:/tmp/demo-viejo' })
  expect(spawned).toEqual([])
  expect(toasts.some(text => /ya no existe en disco: pulsa Limpiar \(w\)/.test(text))).toBe(true)
  await ui.unmount()
})

const PRUNABLE = TREES.replace('detached\n', 'detached\nprunable gitdir file points to non-existent location\n')

test('con un worktree prunable sale Limpiar y al pulsarlo corre git worktree prune y avisa', async ($, on) => {
  const { runs, toasts } = treesEngine(on, PRUNABLE, () => ({ stdout: '' }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-git' })
  expect((await ui.find({ type: 'Button', key: 'prune' }))?.props?.label).toBe('Limpiar')

  await ui.press({ key: 'prune' })
  const prunes = runs.filter(run => run.argv.includes('prune'))
  expect(prunes.map(run => run.argv)).toEqual([['git', 'worktree', 'prune']])
  expect(toasts).toContain('Worktrees limpiados.')
  await ui.unmount()
})

test('sin worktrees prunables no sale el botón Limpiar', async ($, on) => {
  treesEngine(on, TREES, () => ({ stdout: '' }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-git' })
  expect(await ui.find({ type: 'Text', text: /^Worktrees · 3$/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'prune' })).toBeUndefined()
  await ui.unmount()
})

test('si git worktree prune falla, el toast lleva el motivo', async ($, on) => {
  const { toasts } = treesEngine(on, PRUNABLE, () => ({ stdout: '' }), { exitCode: 1, stderr: 'fatal: algo\nmás\n' })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-git' })
  await ui.press({ key: 'prune' })
  expect(toasts).toContain('No se pudieron limpiar los worktrees: fatal: algo')
  await ui.unmount()
})

test('si git status falla en un worktree, GIT sigue y ese worktree queda sin número', async ($, on) => {
  treesEngine(on, TREES, cwd => (cwd === '/tmp/demo-fix' ? 'throw' : { exitCode: 128 }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-git' })
  expect(await ui.find({ type: 'Text', text: /^Worktrees · 3$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^○ fix\/uno\s+\/tmp\/demo-fix$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^○ \(cccccccc?\)\s+\/tmp\/demo-viejo$/ })).toBeDefined()
  await ui.unmount()
})

test('con un solo worktree no sale la sección', async ($, on) => {
  repoEngine(on, argv =>
    argv.includes('--show-toplevel')
      ? '/tmp/demo\n'
      : argv.includes('worktree')
        ? 'worktree /tmp/demo\nHEAD aaaaaaaa\nbranch refs/heads/main\n\n'
        : undefined,
  )
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-git' })
  expect(await ui.find({ type: 'Text', text: /Worktrees/ })).toBeUndefined()
  await ui.unmount()
})

/** Un motor falso cuya transcripción guarda el último registro de modo dado. */
const modeEngine = (on: On, record: string) => {
  baseEngine(on)
  on('session.root', () => ({ value: '/tmp/demo' }))
  on('session.id', () => ({ value: 'abc' }))
  mock.clock(on, { now: 1_000_000 })
  const asked: (readonly string[])[] = []
  on('process.run', (_, e) => {
    if (e.argv[0] === 'sh') asked.push(e.argv)

    return {
      value: {
        ...OK,
        stdout: e.argv[0] === 'sh' ? record : e.argv.includes('log') ? '' : 'main\n',
      },
    }
  })

  return asked
}

test('Status muestra el modo de permisos: plan en naranja, sin permisos en rojo', async ($, on) => {
  const asked = modeEngine(on, '{"type":"permission-mode","permissionMode":"plan","sessionId":"abc"}\n')
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  expect(asked[0]?.at(-1)).toBe('/.claude/projects/-tmp-demo/abc.jsonl')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^Modo$/ })).toBeDefined()
  const mode = await ui.find({ type: 'Text', text: /^plan$/ })
  expect(mode?.props?.color).toBe('warning')
  await ui.unmount()
})

test('sin registro de modo, o con una transcripción que no es JSON, no hay fila Modo', async ($, on) => {
  modeEngine(on, '')
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^Modo$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^Modelo$/ })).toBeDefined()
  await ui.unmount()
})

test('el modo bypassPermissions sale en rojo como "sin permisos"', async ($, on) => {
  modeEngine(on, '{"type":"permission-mode","permissionMode":"bypassPermissions"}')
  on('turn.complete', (_, e) => ({ text: e.answer }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.turn.complete(turn(undefined, 0, 10))

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const mode = await ui.find({ type: 'Text', text: /^sin permisos$/ })
  expect(mode?.props?.color).toBe('error')
  await ui.unmount()
})

test('Status muestra el nivel de esfuerzo de la última petición del hilo principal', async ($, on) => {
  const asked = modeEngine(
    on,
    '{"type":"api-request","querySource":"repl_main_thread","params":{"model":"m","output_config":{"effort":"xhigh"}}}\n',
  )
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  expect(asked.some(argv => argv[2]?.includes('api-request'))).toBe(true)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^Esfuerzo$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^muy alto$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Modo$/ })).toBeUndefined()
  await ui.unmount()
})

test('sin petición con esfuerzo en la transcripción no hay fila Esfuerzo', async ($, on) => {
  modeEngine(on, '{"type":"api-request","querySource":"repl_main_thread","params":{"model":"m"}}\n')
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^Esfuerzo$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^Modelo$/ })).toBeDefined()
  await ui.unmount()
})

test('desde una subcarpeta, lazygit se abre en la raíz del repo', async ($, on) => {
  on('command.register', () => ({ value: { command: 'panel' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))
  mock.clock(on, { now: 1_000_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/tmp/demo/plugins/uno' }))
  on('session.model', () => ({ value: 'opus' }))
  on('env.get', () => ({ value: undefined }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] },
  }))
  on('process.run', (_, e) => ({
    value: {
      ...OK,
      exitCode:
        e.argv[0] === 'sh' && !['lazygit', 'kitty'].includes(e.argv.at(-1) ?? '') ? 1 : 0,
      stdout: e.argv.includes('--show-toplevel') ? '/tmp/demo\n' : e.argv.includes('log') ? '' : 'main\n',
    },
  }))
  const spawned: (readonly string[])[] = []
  on('process.spawn', async function* (_, e) {
    spawned.push([...e.argv])

    return { value: { code: 0, signal: null } }
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-git' })
  await ui.press({ key: 'lazygit' })
  expect(spawned).toEqual([['kitty', '-e', 'lazygit', '-p', '/tmp/demo']])
  await ui.unmount()
})

const STASH_LIST =
  'stash@{0}\t999000\tWIP on main: abc1234 asunto\nstash@{1}\t990000\tOn main: mi mensaje\n'

/** Monta GIT con un motor falso de git donde `stash` responde al `list` y al `show`. */
const stashEngine = async (
  $: Parameters<TestBody>[0],
  on: On,
  stash: (argv: readonly string[]) => { stdout?: string; exitCode?: number },
) => {
  const { calls } = repoEngine(on, argv =>
    argv.includes('status')
      ? '## main\n M a.ts\n'
      : argv.includes('stash')
        ? stash(argv)
        : undefined,
  )
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-git' })

  return { ui, calls }
}

test('GIT lista los stash con el mensaje limpio y el total en el título', async ($, on) => {
  const { ui } = await stashEngine($, on, () => ({ stdout: STASH_LIST }))

  expect(await ui.find({ type: 'Text', text: /^Stash · 2$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /WIP · asunto/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /mi mensaje/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /abc1234|On main/ })).toBeUndefined()
  await ui.unmount()
})

test('GIT no muestra la sección Stash sin stash', async ($, on) => {
  const { ui } = await stashEngine($, on, () => ({ stdout: '' }))

  expect(await ui.find({ type: 'Text', text: /Cambios · 1/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Stash/ })).toBeUndefined()
  await ui.unmount()
})

test('pulsar un stash lee su resumen y volver a pulsarlo lo pliega', async ($, on) => {
  const { ui, calls } = await stashEngine($, on, argv =>
    argv.includes('show')
      ? { stdout: ' a.ts | 1 +\n b.ts | 2 +-\n 2 files changed, 2 insertions(+), 1 deletion(-)\n' }
      : { stdout: STASH_LIST },
  )

  expect(await ui.find({ type: 'Text', text: /b\.ts \| 2/ })).toBeUndefined()
  await ui.press({ key: 'stash:stash@{1}' })
  expect(calls.find(argv => argv.includes('show'))).toEqual([
    'git', 'stash', 'show', '--stat', '--format=', 'stash@{1}',
  ])
  expect(await ui.find({ type: 'Text', text: /b\.ts \| 2/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /2 files changed/ })).toBeDefined()
  await ui.press({ key: 'stash:stash@{1}' })
  expect(await ui.find({ type: 'Text', text: /b\.ts \| 2/ })).toBeUndefined()
  await ui.unmount()
})

test('un stash que ya no existe al leerlo muestra un texto atenuado', async ($, on) => {
  const { ui } = await stashEngine($, on, argv =>
    argv.includes('show') ? { exitCode: 128, stdout: '' } : { stdout: STASH_LIST },
  )

  await ui.press({ key: 'stash:stash@{0}' })
  expect(await ui.find({ type: 'Text', text: /Ese stash ya no existe/ })).toBeDefined()
  await ui.unmount()
})

test('con más stash que el tope, el título lleva el total y solo se listan los primeros', async ($, on) => {
  const many = Array.from(
    { length: 11 },
    (_, at) => `stash@{${at}}\t999000\tOn main: guardado ${at}\n`,
  ).join('')
  const { ui } = await stashEngine($, on, () => ({ stdout: many }))

  expect(await ui.find({ type: 'Text', text: /^Stash · 11$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /guardado 7/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /guardado 8/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^… y 3 más$/ })).toBeDefined()
  await ui.unmount()
})

test('si git stash list falla, GIT se dibuja sin la sección', async ($, on) => {
  const { ui } = await stashEngine($, on, () => ({ exitCode: 128, stdout: STASH_LIST }))

  expect(await ui.find({ type: 'Text', text: /Cambios · 1/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Stash/ })).toBeUndefined()
  await ui.unmount()
})
