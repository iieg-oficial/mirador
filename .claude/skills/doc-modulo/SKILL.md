---
name: doc-modulo
description: Genera la documentación de un módulo existente en docs/modules/<nombre>.md siguiendo el template estándar del proyecto. Úsalo cuando termines de implementar un módulo y quieras documentarlo, o cuando la documentación existente esté desactualizada.
---

# Skill: Documentación de módulo

Cuando se invoca esta skill, lees el código del módulo especificado y produces el archivo `docs/modules/<nombre>.md` siguiendo el template del proyecto.

## Pasos

1. **Identifica el módulo**: el usuario especificará el nombre (ej. `datasets`, `charts`).
2. **Lee el código**: lee todos los archivos del módulo backend (`models.py`, `schemas.py`, `service.py`, `router.py`) y frontend (`features/<nombre>/`) para entender qué existe realmente.
3. **Lee docs existentes**: si ya existe `docs/modules/<nombre>.md`, léelo para actualizar en vez de reescribir desde cero.
4. **Genera el archivo**: escribe `docs/modules/<nombre>.md` siguiendo el template.
5. **Actualiza checklist**: marca el ítem de documentación correspondiente en `docs/checklist.md`.

## Template

```markdown
# Módulo: <Nombre>

**Ruta backend:** `backend/app/modules/<nombre>/`
**Endpoints:** `/api/admin/<nombre>/*` (o `/api/public/<nombre>/*`)
**Frontend:** `frontend/src/features/<nombre>/`
**Estado:** Implementado ✅ / En desarrollo 🚧 / Pendiente ⏳

---

## Responsabilidad

[1-2 párrafos: qué problema resuelve este módulo, qué lugar ocupa en la cadena Connection → Dataset → Chart → Dashboard]

---

## Archivos

| Archivo | Rol |
|---|---|
| `models.py` | [descripción del modelo SQLModel] |
| `schemas.py` | [schemas de entrada/salida] |
| `service.py` | [lógica de negocio] |
| `router.py` | [endpoints y permisos] |

---

## Modelo de datos

[Bloque de código Python con los campos del modelo principal, con comentarios en los no obvios]

---

## API

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
[tabla completa de endpoints]

---

## [Secciones adicionales según el módulo]

Incluir según corresponda:
- **Lógica de negocio importante** (algoritmos, reglas, flujos de estado)
- **Cifrado / seguridad** (si maneja secretos o datos sensibles)
- **Integraciones externas** (si habla con servicios externos)
- **Frontend** (componentes, hooks, estado, flujos de UI)
- **Migraciones** (nombre del archivo, qué crea)
- **Tests** (qué cubren, cómo correrlos)

---

## Seguridad

[Consideraciones de seguridad específicas del módulo: qué no se expone, qué se valida, qué se audita]

---

## Variables de entorno relevantes

| Variable | Descripción |
|---|---|
[solo las específicas de este módulo, si las hay]
```

## Reglas

- Documenta lo que **existe**, no lo que está planeado. Si algo es pendiente, dilo explícitamente.
- Los endpoints se sacan del `router.py` real — no inventes rutas.
- El modelo de datos se saca del `models.py` real — incluye los tipos exactos.
- Mantén el tono técnico y conciso, sin relleno.
- Todo en **español** (documentación, descripciones, comentarios de tabla).
- Después de generar, actualiza `docs/checklist.md` marcando la documentación del módulo.
