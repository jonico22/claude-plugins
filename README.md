# claude-plugins

Mi marketplace personal de plugins para Claude Code.

## Instalar

### Opción A: en un solo paso

Desde la shell:

```bash
claude plugin install panel-claude --marketplace jonico22/claude-plugins
```

Si el marketplace todavía no está añadido, este comando lo añade primero (en la configuración de usuario) y después instala el plugin.

También puedes hacerlo desde el prompt de una sesión de Claude Code:

```
/plugin install panel-claude --marketplace jonico22/claude-plugins
```

Responde `y` para añadir el marketplace y elige el alcance.

### Opción B: en dos pasos

```bash
# 1. Añadir el marketplace (se registra con el nombre jonico22-plugins)
claude plugin marketplace add jonico22/claude-plugins

# 2. Instalar el plugin desde ese marketplace
claude plugin install panel-claude@jonico22-plugins
```

### Alcance

Por defecto se instala con alcance `user`, así que lo tienes en todas tus sesiones. Para limitarlo a un proyecto, usa `--scope`:

| Alcance | Dónde aplica |
|---|---|
| `user` (por defecto) | Todas tus sesiones |
| `project` | Este proyecto; se guarda en la configuración del repo y se comparte con el equipo |
| `local` | Este proyecto, solo en tu máquina |

```bash
claude plugin install panel-claude@jonico22-plugins --scope project
```

### Configurar al instalar

Puedes fijar las opciones del plugin al instalarlo:

```bash
claude plugin install panel-claude@jonico22-plugins --config color=morado
```

O después, con `/config` dentro de Claude Code o con `claude plugin configure panel-claude`.

### Comprobar la instalación

```bash
claude plugin list               # plugins instalados
claude plugin marketplace list   # marketplaces añadidos
```

Reinicia Claude Code para que cargue el plugin. El panel queda acoplado al lado del chat con el terminal en pantalla completa y al menos 110 columnas de ancho; si no, se abre encima del prompt.

### Probar en local (sin instalar)

Desde una copia del repositorio:

```bash
claude --plugin-dir plugins/panel-claude
```

## Actualizar

Cuando haya una versión nueva del plugin:

```bash
# 1. Traer la lista de plugins más reciente del marketplace
claude plugin marketplace update jonico22-plugins

# 2. Actualizar el plugin a la última versión
claude plugin update panel-claude@jonico22-plugins
```

Después **reinicia Claude Code** para que use la versión nueva. Con `claude plugin list` puedes ver qué versión tienes instalada.

Si lo instalaste con un alcance distinto de `user`, indícalo: `claude plugin update panel-claude@jonico22-plugins --scope project`.

`claude plugin marketplace update` sin nombre actualiza todos tus marketplaces.

## Desinstalar

```bash
claude plugin uninstall panel-claude@jonico22-plugins
# opcional: quitar también el marketplace
claude plugin marketplace remove jonico22-plugins
```

Para apagarlo sin desinstalarlo: `claude plugin disable panel-claude@jonico22-plugins` (y `enable` para volver a activarlo).

## Plugins

| Plugin | Qué trae |
|---|---|
| `panel-claude` | Panel lateral con cuatro pestañas (`1` MAIN, `2` GIT, `3` TAREAS, `4` SESIONES). **MAIN:** carpeta, rama, modelo y duración de la sesión; contexto con barra, tokens y costo (con el del último turno); caché con cuenta regresiva, barra que pasa a naranja al 70 % y roja al 90 %, porcentaje leído del caché y aviso en un toast antes de que venza; límites de uso; servidores MCP (los que dejan de aportar herramientas salen en rojo); archivos con cambios y un resumen de subagentes y tareas; botón Compact; la fila Modo (normal, plan, sin permisos...) con el modo de permisos, leído de la transcripción de la sesión, así que va un turno atrasado si lo cambias con shift+tab. La fila Esfuerzo (bajo, medio, alto...) sale igual de la transcripción: aparece tras la primera respuesta y va un turno atrasada si lo cambias con `/effort`. **GIT:** rama, commits por subir y bajar, stage, stash, archivos (los renombrados salen con su ruta nueva) con `+líneas −líneas` agrupados en stage, sin stage y sin seguimiento (todos, con scroll; pulsa un archivo para ver un resumen de su diff y `d` o el botón `Ver diff` para abrir el diff completo en una ventana aparte, con delta si lo tienes), últimos commits con su hora, sección Acciones con `Obtener ramas` (`git fetch`, `f`), `Ver diff` (`d`) y `Abrir lazygit` (`l`), que abre [lazygit](https://github.com/jesseduffield/lazygit) en una ventana de terminal nueva (o en un popup dentro de tmux). Si hay más de una rama local, la sección Ramas las lista por commit más reciente (las primeras 8) con cuánto van por delante o por detrás de su remota. Los archivos que Claude editó en la sesión llevan una marca ✦, el título de Cambios cuenta `N de Claude` y el botón `Solo de Claude` (`o`) filtra la lista a esos. La sección Pull request (necesita [`gh`](https://cli.github.com/) con sesión iniciada; sin él no sale) muestra el PR de la rama, su estado, los checks de CI con los fallidos y pendientes por nombre y el botón `Abrir PR` (`p`); avisa con un toast cuando los checks terminan y se relee al entrar a GIT, tras `Obtener ramas`, tras un `git push` o `gh pr` de Claude y cada minuto mientras haya checks pendientes. Si el repo tiene varios worktrees, la sección Worktrees los lista con `±N` (archivos con cambios sin guardar, solo los primeros 8 y solo si N > 0), `bloqueado` si están bloqueados y `no existe` si su carpeta ya no está; pulsar uno abre lazygit ahí, salvo los que ya no existen, que solo avisan con un toast, y mientras haya alguno el botón `Limpiar` (`w`) ejecuta `git worktree prune`. La sección Stash lista los guardados con su mensaje y hace cuánto se hicieron (los primeros 8); pulsa uno para ver un resumen de los archivos que contiene. Git se relee tras cada edición de Claude. **TAREAS:** subagentes con duración y tokens, y la lista de tareas completa. **SESIONES:** las últimas sesiones de Claude Code en esta carpeta, con su título y hace cuánto se usaron; pulsa una para ver su último prompt, costo, duración y líneas cambiadas, `s` (`Resumir`) para pedir un resumen de 2 o 3 frases al modelo rápido (una llamada pequeña que suma al costo; el resumen queda guardado) y `r` (`Reanudar`) para abrirla con `claude --resume` en una ventana aparte. Se abre solo al iniciar; `/panel` lo abre y `/panel cerrar` lo cierra. En `/config` eliges el color, la duración del caché (por defecto la lee de `promptCacheTtl`), el aviso de vencimiento, la terminal de las ventanas (lazygit, `Ver diff` y `Reanudar`), qué secciones de MAIN se muestran y si GIT muestra el Pull request (`showPr`). |

## Estructura

```
.claude-plugin/marketplace.json   lista de plugins
plugins/<nombre>/
  .claude-plugin/plugin.json      nombre, versión, descripción
  hooks/hooks.json                nombra el módulo de hooks
  hooks/register.tsx              el código del plugin
  types/index.d.ts                los datos que guarda el plugin
  tests/                          pruebas (claude plugin test <carpeta>)
```

## Publicar una versión nueva (para el mantenedor)

1. Sube `version` en `plugins/<nombre>/.claude-plugin/plugin.json` **y** en `.claude-plugin/marketplace.json`. Tienen que coincidir.
2. Valida los manifiestos:
   ```bash
   claude plugin validate .
   ```
3. Haz commit y crea la etiqueta. `claude plugin tag` comprueba que las dos versiones coinciden y crea la etiqueta `<nombre>--v<versión>` (por ejemplo `panel-claude--v0.2.0`):
   ```bash
   git commit -am "panel-claude 0.2.0"
   claude plugin tag plugins/panel-claude
   git push && git push --tags
   ```
4. Los usuarios la reciben siguiendo los pasos de [Actualizar](#actualizar).

## Requisitos

- Claude Code 2.1.322 o más nuevo. El plugin usa una API en acceso anticipado que puede cambiar entre versiones.
- `git`, para la rama, los cambios y los worktrees.
- `lazygit` (opcional), para el botón `Abrir lazygit` y para abrir un worktree.
- `gh` (opcional), para la sección Pull request y sus checks en la pestaña GIT.
