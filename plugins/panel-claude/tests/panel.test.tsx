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

  await has(/Todos · 0 de 1/)
  await has(/▸ Escribir pruebas/)
  await has(/Subagentes · 1/)
  await has(/Explore/)
  await has(/▲ 5k ▼ 250/)
  await has(/Buscar rutas/)
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
        : e.argv.includes('rev-list')
          ? '3\n'
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
  await has(/^3$/)
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
