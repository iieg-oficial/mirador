# Changelog

Todos los cambios notables de Tablerillos se documentan aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y el proyecto usa [Versionado Semántico](https://semver.org/lang/es/).

## [Unreleased]

## [0.4.0] - 2026-07-30

### Añadido

- **Generación asistida por IA (nuevo módulo).** Genera SQL de solo lectura para el
  playground de datasets y gráficas a partir de una descripción en lenguaje natural, en
  tres formatos: ChartSpec 1.0 validada, código JavaScript (ECharts) o código Python
  (Plotly). Toda salida del modelo se revalida en el backend con las mismas defensas que
  el resto del sistema (`sql_guard`, `parse_spec` + `validate_spec_against_dataset`);
  nunca se confía en la IA sin revalidar.
- **Eventos de ECharts en el modo avanzado.** El código del sandbox puede devolver
  `{ option, events }` para registrar manejadores de eventos de ECharts (`click`,
  `legendselectchanged`, ...) sobre una API acotada (`highlight`/`downplay`/`select`/
  `unselect`/`dispatchAction`).
- **Parámetros interactivos en el modo avanzado (`ChartSpec.params`).** Controles
  (select, multiselect, radio, checkbox, slider, fecha, número, texto) que el usuario
  final manipula sin recargar datos del servidor; sus valores llegan al sandbox como
  `params.<id>`.
- **El modo Avanzado se siembra con el código equivalente al armado en Visual.** Al pasar
  del builder visual al modo de código con el editor vacío, ya no arranca con una
  plantilla genérica: trae el código que reproduce la gráfica configurada, usando `rows`
  en vivo (no valores congelados de la corrida en la que se generó).

### Corregido

- **Botones personalizados de toolbox (`toolbox.feature.myXXX`).** Ya no fallan con
  "Bind must be called on a function": ECharts reutilizaba la caché interna del toolbox
  entre corridas del sandbox; ahora se le da un id nuevo en cada ejecución.

### Documentación / Infra

- `docs/modules/ai.md` (nuevo) y `docs/modules/charts.md` documentan el contrato completo
  del sandbox del modo avanzado (`code`, `code_engine`, `params`, `events`, `api`).
- CI: fija `ruff<0.16` para que el lint del backend no falle por reglas nuevas activadas
  por default sin que haya cambios de código.

## [0.3.0] - 2026-07-18

### Añadido

- **Cambio de cuenta al iniciar sesión.** El login pide a Minerva mostrar el selector de
  cuentas (`prompt=select_account`): puedes entrar con otra cuenta ya iniciada o agregar
  una nueva, en vez de entrar siempre en silencio con la última. Requiere Minerva ≥ 0.3.3.

### Corregido

- **Cierre de sesión.** Ya no deja una sesión activa que impedía cambiar de cuenta: el
  logout revoca la sesión y rebota por el logout suave de Minerva para poder elegir otra
  cuenta en el siguiente inicio; regresa correctamente al inicio.
- **Buscador de datasets.** Mantiene el foco al escribir.

### Documentación / Infra

- Guía para levantar Minerva en local (`infra/minerva/`) y notas de la prueba con Minerva
  coubicada en el mismo servidor. El skill de integración documenta el cambio de cuenta.

## [0.2.1] - 2026-07-17

- Arreglos de login/logout.
