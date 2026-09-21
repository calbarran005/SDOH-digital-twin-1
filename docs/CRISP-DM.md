# Aplicación de CRISP-DM al proyecto SDOH Digital Twin (SP-5)

Modelo de proceso: **CRISP-DM** (Chapman et al., 2000; Wirth & Hipp, 2000), seis fases
iterativas. Este documento traza cada fase contra artefactos **verificables** del repositorio,
de modo que la metodología del artículo `Articulo_SP5.docx` (Sección 2) sea auditable.

| Fase | Capa SP-5 | Artefactos en el repositorio |
|---|---|---|
| I. Comprensión del negocio | Transversal | `backend/app/main.py` (roles/permisos), OE1–OE4 y H1–H3 del artículo |
| II. Comprensión de los datos | Sensado físico | `backend/app/models/sdoh.py`, `models/geo.py`, `scripts/seed.py` |
| III. Preparación de los datos | Integración digital | `backend/app/scripts/etl_pipeline.py`, esquema PostGIS, `uq_tract_catalog_year` |
| IV. Modelado | Simulación/analítica | `backend/app/services/equity_service.py`, `api/sdoh.py` (reglas), `services/ai_service.py` |
| V. Evaluación | Simulación/analítica | `crispdm_service.run_evaluation()`: latencia (H3), sensibilidad de pesos (Monte Carlo), completitud |
| VI. Despliegue | Interfaz y gobierno | `docker-compose.yml`, `services/report_service.py`, `services/audit_service.py`, `frontend/src/components/Twin3D.tsx` |

---

## Fase I — Comprensión del negocio

**Objetivo de negocio.** Permitir que un gestor hospitalario identifique, dentro de su área de
captación, los tractos censales con mayor vulnerabilidad social y justifique la asignación de
recursos con evidencia trazable.

**Usuarios y criterios de acceso.** Cinco roles del sistema (`admin`, `analyst`, `clinician`,
`public_health`, `viewer`) sobre diez permisos granulares (`sdoh:read`, `sdoh:compute`,
`alerts:write`, `reports:generate`, …), sembrados en `init_default_data()`.

**Criterios de éxito**

- *De negocio*: priorización explícita de tractos críticos por catchment y reporte difundible.
- *De minería de datos*: índices reproducibles, auditables y recomputables en < 5 s hasta
  500.000 habitantes (H3).

**Restricciones.** Sin datos identificables de paciente (todo agregado a tracto censal);
Python 3.12 + PostGIS 3.4 (wheels geoespaciales); fuentes públicas únicamente.

## Fase II — Comprensión de los datos

**Fuentes previstas.** CDC PLACES (resultados de salud y factores de riesgo por tracto) y
Census ACS (variables socioeconómicas). Geometrías `MULTIPOLYGON`/`POINT`, SRID 4326.

**Unidad de análisis.** Tracto censal (`census_tracts`); unidad de agregación: área de
captación (`hospital_catchments` + `catchment_memberships.population_share`).

**Conjunto de trabajo actual (demo, sintético).** `scripts/seed.py` con `random.seed(42)`:

- 2 condados (36061 New York, 17031 Cook), 2 hospitales, catchment de radio 12 km.
- 160 tractos (80 por hospital), 12 indicadores de 10 categorías, año 2022 → **1.920** valores.
- Gradiente radial de deprivación + ruido gaussiano.

> Este conjunto habilita verificación funcional y pruebas de rendimiento reproducibles,
> **no** inferencia epidemiológica.

**Verificación de calidad.** Completitud (nulos descartados en ingesta), unicidad
`(tract, catalog, year)`, direccionalidad vía `higher_is_better`, intervalos `low_ci`/`high_ci`
y `sample_size` cuando la fuente los publica.

## Fase III — Preparación de los datos

`etl_pipeline.ingest_cdc_places_csv()`:

1. **Selección**: columnas `LocationID`, `Measure`, `Data_Value`.
2. **Limpieza**: descarte de filas sin GEOID, sin medida o con valor faltante.
3. **Integración**: resolución del GEOID contra `census_tracts` y del código de medida contra
   `indicator_catalog`; sin correspondencia → el registro queda fuera del conjunto analítico.
4. **Formateo**: conversión a `float`, asignación de año.
5. **Carga**: transaccional, con restricción de unicidad por (tracto, indicador, año).

**Construcción de variables** (`equity_service.py`):

- Normalización min–max a [0,1] por indicador y año.
- Inversión de indicadores de riesgo: `s = 1 − x̃` cuando `higher_is_better = 0`.
- Pesos del catálogo normalizados a suma unitaria.
- `compute_z_scores()` como transformación alternativa: `z = (v − μ) / σ`.

**Integración espacial.** Agregación ponderada por `population_share`. El diseño permite
sustituir la captación por radio por métodos de área flotante (2SFCA / E2SFCA / MM-G2SFCA)
sin alterar el resto del pipeline.

## Fase IV — Modelado

**Índice compuesto de equidad** (elegido sobre PCA o modelos supervisados por
interpretabilidad y rendición de cuentas):

```
E_t = Σ_k w_k · s_{k,t}     con  s_{k,t} = x̃_{k,t}  (protector)
                                  s_{k,t} = 1 − x̃_{k,t} (riesgo)
V_t = 100 − P_E(E_t)        (percentil de vulnerabilidad)
riesgo(V) = crítico ≥ 90 | alto ≥ 75 | moderado ≥ 50 | bajo
```

El campo `EquityIndex.method` persiste el método usado en cada registro (trazabilidad).

**Modelos complementarios**

- Motor de reglas: `AlertRule(catalog_id, comparison ∈ {gt,lt,gte,lte}, threshold, severity)`
  evaluado en `POST /api/sdoh/alerts/generate`.
- Asistente conversacional (`ai_service.py`): LLM con contexto recuperado de la base
  (conteos, indicadores recientes, tractos más vulnerables, alertas abiertas) e instrucción
  explícita de no fabricar estadísticas.
- Representación 3D (`Twin3D.tsx`): color y altura de vóxel por nivel de riesgo del tracto.

**Supuestos a contrastar**: aditividad/compensabilidad entre dominios, ponderación experta,
ausencia de rezago temporal.

## Fase V — Evaluación

**Criterios**

| Dimensión | Métrica | Hipótesis |
|---|---|---|
| Técnica | Latencia de recomputación (mediana y p95) | H3 |
| Calidad de datos | Completitud por indicador/tracto, cobertura temporal | — |
| Validez | Correlación de Spearman contra el SVI del CDC; sensibilidad de pesos (Monte Carlo) | H1, H2 |
| Utilidad | Precisión/exhaustividad de alertas frente a revisión experta | H1 |

**Protocolo de latencia.** Catchments sintéticos de 50.000 a 500.000 habitantes, 30
repeticiones por tamaño, reportando mediana y percentil 95.

**Revisión del proceso — defectos detectados y corregidos**

| # | Defecto | Estado |
|---|---|---|
| 1 | `compute_equity_indexes()` recomputaba la distribución global **dentro** del bucle por tracto → `O(n²·k)` | Corregido: `compute_composites()` la precomputa una vez; percentil por `bisect` → `O(n·k + n log n)` |
| 2 | `_normalize()` devolvía un dict indexado **por el valor**, consultado **por `tract_id`** → todos los tractos salían `critical` | Corregido: `_normalize()` recibe pares `(tract_id, value)` y devuelve el mapa por tracto |
| 3 | `build_sdoh_context()` usaba `SDOHIndicator.indicator_code` y `EquityIndex.tract_geoid` (inexistentes), silenciados por un `except` genérico | Corregido: joins explícitos a `IndicatorCatalog` y `CensusTract`; `except SQLAlchemyError` con log |
| 4 | `equity_indexes` sin unicidad → recomputar duplicaba filas | Corregido: `uq_equity_tract_year_type` + reemplazo idempotente; DDL en `scripts/migrate.py` |
| 5 | Los `EquityIndex` aleatorios del seed (`method="seed_demo"`) convivían con los calculados | Resuelto: la recomputación los reemplaza; `method` distingue el origen |

**Resultados medidos** (160 tractos · 12 indicadores · 1 114 142 hab., conjunto demo):

| Métrica | Valor |
|---|---|
| Latencia mediana de recomputación | 0,011 s (p95 0,015 s, 5 repeticiones) |
| H3 (< 5 s) | Cumplida — el conjunto ya supera los 500 000 hab. objetivo |
| Spearman medio (±25 % sobre pesos, 20 corridas) | 0,999 |
| Estabilidad del nivel de riesgo | 96,4 % |
| Completitud | 100 % |
| Distribución de riesgo | 79 bajo · 40 moderado · 24 alto · 17 crítico |

## Fase VI — Despliegue

**Infraestructura.** `docker-compose.yml`: PostgreSQL 16 + PostGIS 3.4, API FastAPI
(uvicorn, puerto 8000, OpenAPI en `/docs`), frontend React 18 + TypeScript + Vite
(Three.js / React-Three-Fiber, Recharts) en el puerto 5173.

**Monitoreo y mantenimiento.** RBAC con permisos granulares, bitácora de auditoría
(`audit_service.py`), reportes en PDF/Word/Excel/CSV (`report_service.py`) para actores no
técnicos, y reejecución del ETL + recomputación de índices ante nuevas publicaciones de las
fuentes.

**Realimentación del ciclo.** Alertas, auditoría y reportes retroalimentan la Fase I: son la
señal de deriva que motiva revisar umbrales, pesos y criterios de negocio.

## API de la metodología

Las seis fases se exponen bajo `/api/crispdm` (`app/api/crispdm.py` → `app/services/crispdm_service.py`)
y se navegan desde el sidebar del frontend (`/crisp-dm/:phase`).

| Método | Ruta | Fase | Permiso |
|---|---|---|---|
| GET | `/api/crispdm/phases` | Vista general + estado de avance | autenticado |
| GET | `/api/crispdm/business-understanding` | I | `sdoh:read` |
| GET | `/api/crispdm/data-understanding` | II | `sdoh:read` |
| GET | `/api/crispdm/data-preparation` | III | `sdoh:read` |
| GET | `/api/crispdm/modeling` | IV | `sdoh:read` |
| GET | `/api/crispdm/evaluation` | V (lectura) | `sdoh:read` |
| POST | `/api/crispdm/evaluation/run` | V (banco de pruebas) | `sdoh:compute` |
| GET | `/api/crispdm/deployment` | VI | `sdoh:read` |
| POST | `/api/crispdm/pipeline/run` | III → IV → V encadenadas | `sdoh:compute` |

## Consideraciones éticas y de reproducibilidad

- Agregación a nivel de tracto, sin datos identificables; minimización de datos.
- Reproducibilidad: semilla fija, versiones fijadas en `requirements.txt`, contenedores,
  restricción de unicidad y campo `method`.
- Riesgos documentados: sesgo de representación de las fuentes (Cui, 2025) e interpretación
  errónea del índice como atributo de las personas y no del territorio.

## Referencias del modelo de proceso

- Chapman, P., Clinton, J., Kerber, R., Khabaza, T., Reinartz, T., Shearer, C., & Wirth, R. (2000). *CRISP-DM 1.0: Step-by-step data mining guide*. SPSS Inc.
- Martínez-Plumed, F., et al. (2021). CRISP-DM twenty years later. *IEEE TKDE, 33*(8), 3048–3061.
- Schröer, C., Kruse, F., & Gómez, J. M. (2021). A systematic literature review on applying CRISP-DM. *Procedia Computer Science, 181*, 526–534.
- Wirth, R., & Hipp, J. (2000). CRISP-DM: Towards a standard process model for data mining. *PADD 2000*, 29–39.
