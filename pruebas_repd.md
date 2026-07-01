# Pruebas REPD — queries candidatas para datasets

Notas de trabajo (documento interno, no forma parte de la especificación). Origen del
esquema: `ETL_SIEEJ/migrations/repd/` (catálogos, `stg_repd_case_current`/`_history`,
vista `stg_repd_case_current_vw`, 6 vistas materializadas geo).

**Caveat:** los catálogos (`stg_repd_cat_status`, etc.) se sincronizan dinámicamente
desde el Excel fuente, así que el texto exacto puede variar. Antes de usar las queries
con filtro de texto, correr:

```sql
SELECT id, name FROM stg_repd_cat_status ORDER BY id;
```

Los comentarios de las migraciones V5/V6 documentan `status_id 2 = PERSONA DESAPARECIDA`,
`status_id 3 = PERSONA LOCALIZADA`.

## KPIs

```sql
-- Total de casos registrados
SELECT COUNT(*) AS total_casos FROM stg_repd_case_current;
```

```sql
-- Personas actualmente desaparecidas
SELECT COUNT(*) AS total_desaparecidas
FROM stg_repd_case_current WHERE status_id = 2;
```

```sql
-- Tasa de localización (%)
SELECT ROUND(
  100.0 * COUNT(*) FILTER (WHERE status_id = 3) / NULLIF(COUNT(*), 0), 2
) AS tasa_localizacion
FROM stg_repd_case_current;
```

## Serie temporal / Comparativo (líneas)

```sql
-- Desapariciones reportadas por mes, últimos 24 meses
SELECT
  DATE_TRUNC('month', disappearance_date)::date AS mes,
  COUNT(*) AS total
FROM stg_repd_case_current
WHERE disappearance_date >= now() - interval '24 months'
GROUP BY 1 ORDER BY 1;
```
field_mapping: `x: mes, y: total`

```sql
-- Comparativo: desaparecidos vs localizados por mes
SELECT
  DATE_TRUNC('month', disappearance_date)::date AS mes,
  COUNT(*) FILTER (WHERE status_id = 2) AS desaparecidos,
  COUNT(*) FILTER (WHERE status_id = 3) AS localizados
FROM stg_repd_case_current
WHERE disappearance_date IS NOT NULL
GROUP BY 1 ORDER BY 1;
```
field_mapping: `x: mes, y: [desaparecidos, localizados]` (dos series)

```sql
-- Comparativo: desaparecidos vs localizados por mes, con desglose por sexo
-- (formato tidy: una fila por mes x sexo, pensado para usar `sexo` como Serie)
SELECT
  DATE_TRUNC('month', c.disappearance_date)::date AS mes,
  s.name AS sexo,
  COUNT(*) FILTER (WHERE c.status_id = 2) AS desaparecidos,
  COUNT(*) FILTER (WHERE c.status_id = 3) AS localizados
FROM stg_repd_case_current c
JOIN stg_repd_cat_sex s ON c.sex_id = s.id
WHERE c.disappearance_date IS NOT NULL
GROUP BY 1, 2
ORDER BY 1, 2;
```
field_mapping: `x: mes, series: sexo, y: desaparecidos` (o `localizados`)

## Barras / Ranking

```sql
-- Top 10 municipios con más desapariciones vigentes
SELECT
  m.nomgeo AS municipio,
  COUNT(*) AS total
FROM stg_repd_case_current c
JOIN cvegeo_municipalities m ON c.disappearance_municipality_id = m.id
WHERE c.status_id = 2
GROUP BY m.nomgeo
ORDER BY total DESC
LIMIT 10;
```

```sql
-- Ranking de municipios por tasa de desaparición (más reciente, por 100k hab.)
SELECT nombre AS municipio, tasa_total
FROM personas_desaparecidas
WHERE fecha = (SELECT MAX(fecha) FROM personas_desaparecidas)
ORDER BY tasa_total DESC NULLS LAST
LIMIT 15;
```

## Pastel / Dona

```sql
-- Distribución por sexo (casos vigentes desaparecidos)
SELECT sex AS sexo, COUNT(*) AS total
FROM stg_repd_case_current_vw
WHERE status = 'PERSONA DESAPARECIDA'
GROUP BY sex;
```

```sql
-- Distribución por rango de edad
SELECT age_range AS rango_edad, COUNT(*) AS total
FROM stg_repd_case_current_vw
GROUP BY age_range
ORDER BY total DESC;
```

```sql
-- Distribución por estatus actual
SELECT status AS estatus, COUNT(*) AS total
FROM stg_repd_case_current_vw
GROUP BY status
ORDER BY total DESC;
```

## Mapa coroplético municipal

```sql
-- Tasa de desaparición por municipio, último mes disponible
SELECT nombre, clave_municipio, tasa_total, total, geom_iieg
FROM personas_desaparecidas
WHERE fecha = (SELECT MAX(fecha) FROM personas_desaparecidas);
```

Hay variantes ya hechas para hombres/mujeres y para localizados (`personas_localizadas*`)
— mismo patrón.

## Tabla detalle

```sql
-- Listado de casos (para tabla con filtros)
SELECT
  feb, sex, age_range, report_date, disappearance_date,
  disappearance_municipality, status, location_date, location_municipality
FROM stg_repd_case_current_vw
ORDER BY report_date DESC
LIMIT 500;
```

## Dispersión / Área

```sql
-- Días promedio hasta localización, por municipio de desaparición
SELECT
  m.nomgeo AS municipio,
  AVG(c.location_date - c.disappearance_date) AS dias_promedio_localizacion,
  COUNT(*) AS total_localizados
FROM stg_repd_case_current c
JOIN cvegeo_municipalities m ON c.disappearance_municipality_id = m.id
WHERE c.status_id = 3 AND c.location_date IS NOT NULL AND c.disappearance_date IS NOT NULL
GROUP BY m.nomgeo
HAVING COUNT(*) >= 5
ORDER BY dias_promedio_localizacion DESC;
```

```sql
-- Acumulado anual: reportados vs localizados (para área apilada)
SELECT
  EXTRACT(YEAR FROM disappearance_date)::int AS anio,
  COUNT(*) AS reportados,
  COUNT(*) FILTER (WHERE status_id = 3) AS localizados
FROM stg_repd_case_current
WHERE disappearance_date IS NOT NULL
GROUP BY 1 ORDER BY 1;
```

## Pendiente

- Validar contra la BD real (catálogos, volúmenes, nulls en `disappearance_municipality_id`).
- Decidir conexión: ¿Tablerillos lee directo del Postgres de ETL_SIEEJ (mismas vistas
  materializadas y FDW), o se replica un subconjunto?
- Convertir en datasets concretos cuando el módulo de datasets esté implementado.
