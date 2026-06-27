---
name: nuevo-modulo
description: Andamia un nuevo módulo completo en Tablerillos — backend (models, schemas, service, router, migración) y frontend (tipos, api, página, ruta en el router). Úsalo al comenzar la implementación de un módulo nuevo como datasets, charts o dashboards. Requiere que el usuario especifique el nombre del módulo y si es admin, público o ambos.
---

# Skill: Andamiaje de nuevo módulo

Cuando se invoca esta skill, creas la estructura completa de un nuevo módulo siguiendo exactamente los patrones del proyecto.

## Información necesaria antes de comenzar

Pide al usuario si no está claro:
- **Nombre del módulo** (singular, snake_case, ej. `dataset`)
- **Nombre plural** para las rutas (ej. `datasets`)
- **¿Admin, público o ambos?** (determina qué rutas y permisos crear)
- **Descripción breve** de qué hace el módulo (para los docstrings)

## Archivos a crear / modificar

### Backend — nuevos archivos

**`backend/app/modules/<nombre>/__init__.py`**
```python
```
(vacío)

**`backend/app/modules/<nombre>/models.py`**
```python
"""<Descripción del módulo>.

Ver `tablerillos.md` §<sección>.
"""

import enum

from sqlmodel import Field

from app.shared.models import UUIDAuditBase


class <Nombre>Status(str, enum.Enum):
    activo = "activo"
    archivado = "archivado"


class <Nombre>(UUIDAuditBase, table=True):
    """<Descripción del modelo>."""

    __tablename__ = "<nombre_plural>"

    name: str = Field(index=True, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    status: <Nombre>Status = Field(default=<Nombre>Status.activo)
```

**`backend/app/modules/<nombre>/schemas.py`**
```python
"""Schemas de entrada/salida del módulo <nombre>."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.modules.<nombre>.models import <Nombre>Status


class <Nombre>Create(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)


class <Nombre>Update(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    status: <Nombre>Status | None = None


class <Nombre>Read(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    status: <Nombre>Status
    created_by: str | None
    created_by_email: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
```

**`backend/app/modules/<nombre>/service.py`**
```python
"""Lógica de negocio del módulo <nombre>."""

import uuid

from sqlmodel import Session, select

from app.modules.auth.models import CurrentUser
from app.modules.<nombre>.models import <Nombre>, <Nombre>Status
from app.modules.<nombre>.schemas import <Nombre>Create, <Nombre>Update


def list_<nombre_plural>(session: Session) -> list[<Nombre>]:
    return list(session.exec(select(<Nombre>).where(<Nombre>.status != <Nombre>Status.archivado)).all())


def get_<nombre>(session: Session, <nombre>_id: uuid.UUID) -> <Nombre> | None:
    return session.get(<Nombre>, <nombre>_id)


def create_<nombre>(session: Session, data: <Nombre>Create, user: CurrentUser) -> <Nombre>:
    obj = <Nombre>(
        **data.model_dump(),
        created_by=user.sub,
        created_by_email=user.email,
    )
    session.add(obj)
    session.commit()
    session.refresh(obj)
    return obj


def update_<nombre>(session: Session, obj: <Nombre>, data: <Nombre>Update) -> <Nombre>:
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    session.add(obj)
    session.commit()
    session.refresh(obj)
    return obj


def delete_<nombre>(session: Session, obj: <Nombre>) -> None:
    obj.status = <Nombre>Status.archivado
    session.add(obj)
    session.commit()
```

**`backend/app/modules/<nombre>/router.py`**
```python
"""Endpoints del módulo <nombre> (§<sección>)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.core.database import get_session
from app.modules.auth.deps import require_permission
from app.modules.auth.models import CurrentUser
from app.modules.<nombre> import service
from app.modules.<nombre>.models import <Nombre>
from app.modules.<nombre>.schemas import <Nombre>Create, <Nombre>Read, <Nombre>Update

router = APIRouter()


def _get_or_404(session: Session, <nombre>_id: uuid.UUID) -> <Nombre>:
    obj = service.get_<nombre>(session, <nombre>_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="<Nombre> no encontrado")
    return obj


@router.get("", response_model=list[<Nombre>Read])
def list_<nombre_plural>(
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.<nombre_plural>.view")),
) -> list[<Nombre>]:
    return service.list_<nombre_plural>(session)


@router.post("", response_model=<Nombre>Read, status_code=status.HTTP_201_CREATED)
def create_<nombre>(
    data: <Nombre>Create,
    session: Session = Depends(get_session),
    user: CurrentUser = Depends(require_permission("tablerillos.<nombre_plural>.create")),
) -> <Nombre>:
    return service.create_<nombre>(session, data, user)


@router.get("/{<nombre>_id}", response_model=<Nombre>Read)
def get_<nombre>(
    <nombre>_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.<nombre_plural>.view")),
) -> <Nombre>:
    return _get_or_404(session, <nombre>_id)


@router.put("/{<nombre>_id}", response_model=<Nombre>Read)
def update_<nombre>(
    <nombre>_id: uuid.UUID,
    data: <Nombre>Update,
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.<nombre_plural>.update")),
) -> <Nombre>:
    obj = _get_or_404(session, <nombre>_id)
    return service.update_<nombre>(session, obj, data)


@router.delete("/{<nombre>_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_<nombre>(
    <nombre>_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: CurrentUser = Depends(require_permission("tablerillos.<nombre_plural>.delete")),
) -> None:
    obj = _get_or_404(session, <nombre>_id)
    service.delete_<nombre>(session, obj)
```

### Backend — archivos a modificar

**`backend/app/models.py`** — añadir al final:
```python
from app.modules.<nombre>.models import <Nombre>  # noqa: F401,E402
```

**`backend/app/main.py`** — añadir import y `include_router`:
```python
from app.modules.<nombre>.router import router as <nombre>_router
app.include_router(<nombre>_router, prefix="/api/admin/<nombre_plural>", tags=["<nombre_plural>"])
```

**`manifest.minerva.yml`** — añadir permisos bajo la sección correspondiente:
```yaml
- { key: tablerillos.<nombre_plural>.view,   name: Ver <nombre_plural> }
- { key: tablerillos.<nombre_plural>.create, name: Crear <nombre_plural> }
- { key: tablerillos.<nombre_plural>.update, name: Editar <nombre_plural> }
- { key: tablerillos.<nombre_plural>.delete, name: Eliminar <nombre_plural> }
```
Y añadir los permisos a los roles `Superadmin` y `Administrador BI` según corresponda.

### Migración Alembic

```bash
conda run -n tab alembic revision --autogenerate -m "tabla <nombre_plural>"
```

Revisar el archivo generado y ajustar si es necesario (especialmente ENUMs).

### Frontend — nuevos archivos

**`frontend/src/types/<nombre_plural>.ts`**
```typescript
export type <Nombre>Status = 'activo' | 'archivado'

export interface <Nombre> {
  id: string
  name: string
  description: string | null
  status: <Nombre>Status
  created_by: string | null
  created_by_email: string | null
  created_at: string
  updated_at: string
}

export interface <Nombre>Create {
  name: string
  description?: string | null
}

export interface <Nombre>Update {
  name?: string
  description?: string | null
  status?: <Nombre>Status
}
```

**`frontend/src/features/<nombre_plural>/api.ts`**
```typescript
import type { <Nombre>, <Nombre>Create, <Nombre>Update } from '@/types/<nombre_plural>'

const BASE = '/api/admin/<nombre_plural>'

async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const detail = await res.json().then(d => d.detail).catch(() => res.statusText)
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  return res.json()
}

export async function list<Nombre>s(): Promise<<Nombre>[]> {
  return parseResponse(await fetch(BASE))
}

export async function create<Nombre>(data: <Nombre>Create): Promise<<Nombre>> {
  return parseResponse(await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }))
}

export async function update<Nombre>(id: string, data: <Nombre>Update): Promise<<Nombre>> {
  return parseResponse(await fetch(`${BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }))
}

export async function delete<Nombre>(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Error al eliminar: ${res.status}`)
}
```

**`frontend/src/features/<nombre_plural>/<Nombre>sPage.tsx`** — estructura básica:
```typescript
import { useQuery } from '@tanstack/react-query'
import { list<Nombre>s } from './<nombre_plural>Api'

export function <Nombre>sPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['<nombre_plural>'],
    queryFn: list<Nombre>s,
  })

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold text-gray-900"><Nombre_plural_legible></h1>
      {/* implementar */}
    </div>
  )
}
```

### Frontend — archivos a modificar

**`frontend/src/app/router.tsx`** — añadir import y ruta:
```typescript
import { <Nombre>sPage } from '@/features/<nombre_plural>/<Nombre>sPage'
// dentro de children de AdminLayout:
{ path: '<nombre_plural>', element: <<Nombre>sPage /> },
```

**`frontend/src/features/admin/AdminLayout.tsx`** — añadir al array `NAV`:
```typescript
{
  to: '/admin/<nombre_plural>',
  label: '<Nombre_plural_legible>',
  icon: (<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="..." />),
},
```

## Reglas

- Reemplaza todos los placeholders `<Nombre>`, `<nombre>`, `<nombre_plural>` con los valores reales.
- No inventes lógica de negocio más allá del CRUD básico — el andamiaje es el punto de partida.
- Siempre añade los permisos al `manifest.minerva.yml` antes de proteger los endpoints.
- Al terminar: correr `ruff check` + `pytest` para verificar que el andamiaje compila y pasa los tests básicos.
- Si el módulo es público (sin auth), las rutas van en `/api/public/<nombre_plural>` y sin `require_permission`.
