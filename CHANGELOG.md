# Changelog

Todos los cambios notables de Tablerillos se documentan aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y el proyecto usa [Versionado Semántico](https://semver.org/lang/es/).

## [Unreleased]

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
