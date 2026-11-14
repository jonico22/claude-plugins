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
| `panel-claude` | Panel lateral con carpeta, rama de git, modelo, contexto usado, tokens y costo, los subagentes de la sesión con sus tokens, la lista de tareas, una cuenta regresiva estimada del caché, los límites de uso y un botón Compact. La pestaña GIT muestra los archivos con cambios y los últimos commits. Se abre solo al iniciar; `/panel` lo abre y `/panel cerrar` lo cierra. La duración del caché se lee sola de `promptCacheTtl` en tu configuración de Claude Code (o la fijas en `/config` con 5m o 1h); el color del panel también se elige en `/config`. |

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
- `git`, para mostrar la rama.
