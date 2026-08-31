# 🏥 SDOH Digital Twin 3D

**A Digital Twin Framework for Real-Time Monitoring of Social Determinants of Health (SDOH) and Health Equity in Metropolitan Hospital Catchment Areas.**

Aplicación full-stack de gemelos digitales 3D para monitorear determinantes sociales de la salud y equidad en salud dentro de las áreas de captación de hospitales metropolitanos, basada en **datasets públicos** (CDC PLACES y Census ACS).

---

## ✨ Módulos incluidos

| Módulo | Descripción |
|--------|-------------|
| **Dashboard 3D** | Gemelo digital 3D (Three.js / React-Three-Fiber) del área hospitalaria; cada census tract es una voxel coloreada y con altura según su nivel de riesgo o índice de equidad. |
| **Mapa SDOH** | Exploración de indicadores de determinantes sociales (ingreso, educación, vivienda, empleo, transporte, alimentación, acceso a salud, etc.) agrupados por dominio. |
| **Equidad en Salud** | Cálculo de índices compuestos de equidad por census tract, percentiles de vulnerabilidad y niveles de riesgo (low/moderate/high/critical). |
| **Hospitales & Catchments** | Registro de hospitales y sus áreas de captación (catchment areas) con asignación de census tracts. |
| **Alertas** | Reglas de alerta configurables y generación de alertas por umbrales de indicadores. |
| **Reportes** | Generación de reportes en **PDF, Word (.docx), Excel (.xlsx) y CSV**. |
| **Usuarios, Roles y Perfiles** | Autenticación JWT, roles con permisos granulares (admin, clínico, analista, salud pública, visor), perfiles y auditoría. |

---

## 🧱 Stack tecnológico

- **Backend:** Python 3.12 · FastAPI · SQLAlchemy · GeoAlchemy2 (PostGIS)
- **Frontend:** React 18 · TypeScript · Vite · Three.js / React-Three-Fiber / Drei · Recharts
- **Base de datos:** PostgreSQL 16 + PostGIS 3.4
- **ETL:** pandas + script de importación para CDC PLACES CSV y Census ACS

---

## 📁 Estructura del proyecto

```
.
├── docker-compose.yml          # PostGIS + backend + frontend
├── .env.example                # Variables de entorno (copiar a .env)
├── Makefile                    # atajos (up, down, seed, etl, etc.)
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py             # App FastAPI + seed de roles/admin
│       ├── core/               # config, database, security
│       ├── models/             # SQLAlchemy + PostGIS (geo, sdoh, users, reports)
│       ├── schemas/            # Pydantic
│       ├── api/                # Routers (auth, users, geo, hospitals, sdoh, reports)
│       ├── services/           # equity, reportes (PDF/Word/Excel/CSV), auditoría
│       └── scripts/            # seed, migrate, etl_pipeline
└── frontend/
    ├── Dockerfile
    ├── package.json
    └── src/
        ├── api/                # Cliente axios + interceptor JWT
        ├── components/         # Layout, Twin3D, StatCard, ProtectedRoute
        ├── pages/              # Dashboard, SdohMap, Equity, Hospitals, Alerts, Reports, Users, Profile
        ├── store/              # zustand (auth)
        └── types/
```

---

## 🚀 Puesta en marcha (Docker Compose)

Requisito: **Docker** con plugin Compose.

```bash
# 1. Configurar variables de entorno
cp .env.example .env

# 2. Levantar la infraestructura (PostGIS + backend + frontend)
docker compose up -d --build

# 3. Cargar el dataset demo (hospitales, census tracts, indicadores SDOH, índices de equidad, alertas)
make seed
# o bien: docker compose exec backend python -m app.scripts.seed

# 4. Acceder
#    Frontend:  http://localhost:5173
#    API docs:  http://localhost:8000/docs
```

> El backend crea tablas y seed de **roles, permisos y usuario admin** automáticamente al arrancar.

### Credenciales por defecto

| Usuario | Contraseña | Rol |
|---------|-----------|-----|
| `admin` | `admin123` | Administrador (superusuario) |

---

## 📦 Importar datasets públicos reales

El sistema viene con un dataset **demo/sintético** para funcionar de inmediato. Para usar datos reales:

### CDC PLACES (health outcomes + SDOH)
```bash
# 1. Descargar el CSV desde https://data.cdc.gov (browse "PLACES")
#    Guardar en backend/data/raw/places.csv

# 2. Registrar los indicadores que interesan en el catálogo (vía API o seed)
# 3. Importar
docker compose exec backend python -m app.scripts.etl_pipeline --cdc backend/data/raw/places.csv
```

### Census ACS (American Community Survey)
La API de Census (`https://api.census.gov`) puede consultarse con la función ETL; los indicadores ACS
se mapean a los códigos del catálogo (ingreso, educación, vivienda, transporte, etc.).

Ver `backend/app/scripts/etl_pipeline.py` para los puntos de integración.

---

## 🛠️ Comandos útiles (Makefile)

```bash
make up          # levantar servicios
make down        # detener
make logs        # ver logs
make seed        # cargar dataset demo (reinicia tablas)
make seed-etl    # ejecutar ETL
make migrate     # seed roles/admin (seguro de repetir)
make psql        # consola SQL
```

---

## 🔌 API principal (resumen)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/login` | Iniciar sesión (JWT) |
| GET | `/api/auth/me` | Usuario actual |
| GET/POST | `/api/users` | Listar / crear usuarios (admin) |
| GET | `/api/users/roles/all` | Roles y permisos |
| GET | `/api/geo/health-system/stats` | Estadísticas del sistema |
| GET | `/api/geo/catchments` | Áreas de captación |
| GET/POST | `/api/hospitals` | Hospitales |
| GET | `/api/sdoh/catalog` | Catálogo de indicadores |
| GET | `/api/sdoh/values` | Valores SDOH |
| GET | `/api/sdoh/equity` | Índices de equidad |
| POST | `/api/sdoh/equity/compute` | Recalcular índices |
| GET | `/api/sdoh/alerts` | Alertas |
| POST | `/api/sdoh/alerts/generate` | Generar alertas por reglas |
| POST | `/api/reports/generate` | Generar reporte (pdf/word/excel/csv) |
| GET | `/api/reports/download/{id}` | Descargar reporte |

Documentación interactiva completa en **http://localhost:8000/docs** (Swagger UI).

---

## ⚠️ Notas

- **Python 3.14 local:** algunas librerías geoespaciales (`shapely`, `psycopg2-binary`) aún no publican
  wheels para Python 3.14 en Windows. El proyecto está fijado a **Python 3.12** dentro de Docker, donde
  todas las dependencias se instalan sin problemas. Para desarrollo local use Python 3.12.
- Los reportes generados se guardan en `backend/generated_reports/`.

---

## 🗂️ Modelo de datos clave

- **counties / census_tracts** — geometrías PostGIS (MultiPolygon) de unidades censales.
- **hospitals / hospital_catchments / catchment_memberships** — hospitales, áreas de captación y su
  relación con los census tracts (con fracción de población).
- **indicator_catalog / sdoh_indicators** — catálogo de indicadores SDOH y sus valores por tract/año.
- **equity_indexes** — índices de equidad calculados por tract.
- **alert_rules / alerts** — reglas y alertas generadas.
- **users / roles / permissions / profiles / audit_logs** — seguridad y auditoría.
```
