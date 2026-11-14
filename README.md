# claude-plugins

Mi marketplace personal de plugins para Claude Code.

## Instalar

En el prompt de una sesión de Claude Code en el terminal:

```
/plugin install panel-claude --marketplace jonico22/claude-plugins
```

Responde `y` para añadir el marketplace y elige el alcance (usuario, para tenerlo en todas tus sesiones).

Desde la shell:

```
claude plugin install panel-claude --marketplace jonico22/claude-plugins
```

Para probarlo en local desde una copia del repositorio:

```
claude --plugin-dir plugins/panel-claude
```

El panel queda acoplado al lado del chat con el terminal en pantalla completa y al menos 110 columnas de ancho; si no, se abre encima del prompt.

## Plugins

| Plugin | Qué trae |
|---|---|
| `panel-claude` | Panel lateral con carpeta, rama de git, modelo, contexto usado, tokens y costo, los subagentes de la sesión con sus tokens, la lista de tareas, una cuenta regresiva estimada del caché, los límites de uso y un botón Compact. La pestaña GIT muestra los archivos con cambios y los últimos commits. Se abre solo al iniciar; `/panel` lo abre y `/panel cerrar` lo cierra. La duración del caché (5m o 1h) y el color del panel se eligen en `/config`. |

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

## Versiones

1. Sube `version` en `plugin.json` **y** en `marketplace.json`.
2. `git commit` + `git tag panel-claude-v0.2.0` + `git push --tags`.
3. En Claude Code: `/plugin marketplace update jonico22-plugins`.

## Requisitos

- Claude Code 2.1.322 o más nuevo. El plugin usa una API en acceso anticipado que puede cambiar entre versiones.
- `git`, para mostrar la rama.
