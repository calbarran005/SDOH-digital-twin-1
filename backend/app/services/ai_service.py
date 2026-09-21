import logging
import os

import requests
from openai import OpenAI

logger = logging.getLogger(__name__)


client = OpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))

AI_PROVIDER = os.getenv("AI_PROVIDER", "openai").lower()
LANGFLOW_BASE_URL = os.getenv("LANGFLOW_BASE_URL", "http://localhost:7860").rstrip("/")
LANGFLOW_FLOW_ID = os.getenv("LANGFLOW_FLOW_ID", "sdoh-assistant")
LANGFLOW_API_KEY = os.getenv("LANGFLOW_API_KEY", "")
LANGFLOW_PROMPT_NODE = os.getenv("LANGFLOW_PROMPT_NODE", "Prompt Template")
LANGFLOW_TIMEOUT = float(os.getenv("LANGFLOW_TIMEOUT", "120"))

SYSTEM_PROMPT_EN = """You are a specialized SDOH (Social Determinants of Health) assistant for a Digital Twin platform.
You have access to data about hospitals, census tracts, equity indices, and health alerts for a metropolitan area.
Answer concisely and technically in English. Use data context when available.
If you don't have enough data, say so clearly. Never fabricate statistics."""

SYSTEM_PROMPT_ES = """Eres un asistente especializado en SDOH (Determinantes Sociales de la Salud) para una plataforma de Gemelo Digital.
Tienes acceso a datos de hospitales, census tracts, índices de equidad y alertas de salud de un área metropolitana.
Responde de forma concisa y técnica en español. Usa el contexto de datos cuando esté disponible.
Si no tienes suficientes datos, dilo claramente. Nunca fabriques estadísticas."""


SYSTEM_DESCRIPTION = """SDOH Digital Twin 3D: plataforma web (FastAPI + PostGIS + React/Three.js) para monitorear
Determinantes Sociales de la Salud (SDOH) y equidad en salud en las áreas de captación (catchments) de
hospitales metropolitanos. Módulos de la app:
- Dashboard 3D: gemelo digital; cada census tract es un voxel coloreado/elevado según riesgo o índice de equidad.
- Mapa SDOH: indicadores por census tract agrupados por dominio.
- Equidad: índice compuesto de equidad por tract (composite_equity), percentil de vulnerabilidad 0-100
  (100 = más vulnerable) y nivel de riesgo low/moderate/high/critical.
- Hospitales: hospitales y sus catchments (radio en km) con los tracts asignados.
- Alertas: reglas por umbral de indicador (threshold_alert) que generan alertas por tract.
- Reportes: exportación PDF, Word, Excel y CSV.
- Usuarios/roles: JWT con roles admin, clínico, analista, salud pública y visor.
- CRISP-DM: las 6 fases de la metodología de minería de datos aplicadas al proyecto.
Dataset: CDC PLACES 2025 (data.cdc.gov, id cwsq-ngmh), dominio público. Son estimaciones modeladas
(small-area estimation con BRFSS + Census ACS) de prevalencia en adultos (%) por census tract.
Geometrías: Census TIGERweb."""


def build_sdoh_context(db_session) -> str:
    """Build a context string from the database for RAG-style prompting.

    Includes a description of the platform plus aggregates of the public dataset
    (coverage, indicator statistics, equity distribution, hospitals and alerts).
    """
    from sqlalchemy import func
    from sqlalchemy.exc import SQLAlchemyError

    from app.models.geo import (
        CatchmentMembership,
        CensusTract,
        County,
        Hospital,
        HospitalCatchment,
    )
    from app.models.sdoh import Alert, EquityIndex, IndicatorCatalog, SDOHIndicator

    context_parts = [SYSTEM_DESCRIPTION]
    try:
        # --- Cobertura ---
        tract_count = db_session.query(CensusTract).count()
        population = db_session.query(func.sum(CensusTract.total_population)).scalar() or 0
        years = [y for (y,) in db_session.query(SDOHIndicator.year).distinct().order_by(SDOHIndicator.year)]
        latest_year = years[-1] if years else None
        counties = db_session.query(County).order_by(County.geoid).all()
        county_names = {c.id: c.name for c in counties}
        context_parts.append(
            "Cobertura de la BD:\n"
            + "\n".join(f"- {c.name}, {c.state_name} (FIPS {c.geoid})" for c in counties)
            + f"\n- Census tracts: {tract_count}, población total: {population:,}"
            + f"\n- Años con datos: {', '.join(map(str, years)) or 'ninguno'}"
        )

        # --- Indicadores (último año): media global, rango y media por county ---
        if latest_year is not None:
            rows = (
                db_session.query(
                    IndicatorCatalog.code,
                    IndicatorCatalog.name,
                    IndicatorCatalog.domain,
                    IndicatorCatalog.higher_is_better,
                    IndicatorCatalog.threshold_alert,
                    func.avg(SDOHIndicator.value),
                    func.min(SDOHIndicator.value),
                    func.max(SDOHIndicator.value),
                    func.count(SDOHIndicator.id),
                )
                .join(IndicatorCatalog, SDOHIndicator.catalog_id == IndicatorCatalog.id)
                .filter(SDOHIndicator.year == latest_year)
                .group_by(IndicatorCatalog.id)
                .order_by(IndicatorCatalog.domain, IndicatorCatalog.code)
                .all()
            )
            by_county = {}
            for code, county_id, avg in (
                db_session.query(IndicatorCatalog.code, CensusTract.county_id, func.avg(SDOHIndicator.value))
                .join(IndicatorCatalog, SDOHIndicator.catalog_id == IndicatorCatalog.id)
                .join(CensusTract, SDOHIndicator.tract_id == CensusTract.id)
                .filter(SDOHIndicator.year == latest_year)
                .group_by(IndicatorCatalog.code, CensusTract.county_id)
                .all()
            ):
                by_county.setdefault(code, []).append(f"{county_names.get(county_id, county_id)}={avg:.1f}")
            lines = []
            for code, name, domain, hib, threshold, avg, vmin, vmax, n in rows:
                extra = f", umbral alerta={threshold}" if threshold is not None else ""
                better = "mayor es mejor" if hib else "menor es mejor"
                lines.append(
                    f"- {code} | {name} | {domain} | {better}{extra} | media={avg:.1f}, "
                    f"min={vmin:.1f}, max={vmax:.1f}, n={n} | por county: {', '.join(by_county.get(code, []))}"
                )
            context_parts.append(
                f"Indicadores SDOH {latest_year} (prevalencia % en adultos por tract):\n" + "\n".join(lines)
            )

        # --- Equidad (último año) ---
        eq_year = db_session.query(func.max(EquityIndex.year)).scalar()
        if eq_year is not None:
            dist = (
                db_session.query(CensusTract.county_id, EquityIndex.risk_level, func.count(EquityIndex.id))
                .join(CensusTract, EquityIndex.tract_id == CensusTract.id)
                .filter(EquityIndex.year == eq_year, EquityIndex.index_type == "composite_equity")
                .group_by(CensusTract.county_id, EquityIndex.risk_level)
                .all()
            )
            per_county = {}
            for county_id, risk, n in dist:
                per_county.setdefault(county_names.get(county_id, county_id), []).append(f"{risk}={n}")
            top = (
                db_session.query(
                    CensusTract.geoid,
                    CensusTract.county_id,
                    CensusTract.total_population,
                    EquityIndex.value,
                    EquityIndex.percentile,
                    EquityIndex.risk_level,
                )
                .join(CensusTract, EquityIndex.tract_id == CensusTract.id)
                .filter(
                    EquityIndex.year == eq_year,
                    EquityIndex.index_type == "composite_equity",
                    EquityIndex.percentile.is_not(None),
                )
                .order_by(EquityIndex.percentile.desc())
                .limit(10)
                .all()
            )
            context_parts.append(
                f"Índice de equidad compuesto {eq_year}, tracts por nivel de riesgo:\n"
                + "\n".join(f"- {name}: {', '.join(v)}" for name, v in per_county.items())
                + "\nTop 10 tracts más vulnerables:\n"
                + "\n".join(
                    f"- {geoid} ({county_names.get(cid, cid)}, pobl. {pop}): índice={value:.3f}, "
                    f"percentil vulnerabilidad={pct}, riesgo={risk}"
                    for geoid, cid, pop, value, pct, risk in top
                )
            )

        # --- Hospitales y catchments ---
        hosp_lines = []
        for h in db_session.query(Hospital).order_by(Hospital.name).all():
            for c in db_session.query(HospitalCatchment).filter(HospitalCatchment.hospital_id == h.id).all():
                tract_ids = db_session.query(CatchmentMembership.tract_id).filter(
                    CatchmentMembership.catchment_id == c.id
                )
                n_tracts = tract_ids.count()
                pop = (
                    db_session.query(func.sum(CensusTract.total_population))
                    .filter(CensusTract.id.in_(tract_ids))
                    .scalar()
                    or 0
                )
                risk = dict(
                    db_session.query(EquityIndex.risk_level, func.count(EquityIndex.id))
                    .filter(
                        EquityIndex.tract_id.in_(tract_ids),
                        EquityIndex.year == eq_year,
                        EquityIndex.index_type == "composite_equity",
                    )
                    .group_by(EquityIndex.risk_level)
                    .all()
                )
                hosp_lines.append(
                    f"- {h.name} ({h.city}, {h.state}): catchment {c.catchment_type} "
                    f"{c.radius_km} km, {n_tracts} tracts, población {pop:,}, "
                    f"riesgo: {', '.join(f'{k}={v}' for k, v in sorted(risk.items()))}"
                )
        if hosp_lines:
            context_parts.append("Hospitales y áreas de captación:\n" + "\n".join(hosp_lines))

        # --- Alertas abiertas ---
        open_alerts = db_session.query(Alert).filter(Alert.status == "open")
        total_alerts = open_alerts.count()
        if total_alerts:
            by_ind = (
                db_session.query(Alert.indicator_name, Alert.severity, func.count(Alert.id))
                .filter(Alert.status == "open")
                .group_by(Alert.indicator_name, Alert.severity)
                .order_by(func.count(Alert.id).desc())
                .limit(15)
                .all()
            )
            context_parts.append(
                f"Alertas abiertas: {total_alerts}. Por indicador:\n"
                + "\n".join(f"- {name} ({sev}): {n}" for name, sev, n in by_ind)
            )
    except SQLAlchemyError as exc:
        logger.warning("No se pudo construir el contexto SDOH: %s", exc)
        db_session.rollback()
        context_parts.append("(Database context unavailable)")

    return "\n\n".join(context_parts)


def chat_with_ai(
    message: str, language: str = "es", db_session=None, session_id: str | None = None
) -> str:
    """Send a message to the configured AI provider with SDOH context."""
    if AI_PROVIDER == "langflow":
        return chat_with_langflow(message, language, db_session, session_id)
    return chat_with_openai(message, language, db_session)


def chat_with_langflow(
    message: str, language: str = "es", db_session=None, session_id: str | None = None
) -> str:
    """Run the SDOH Assistant flow in Langflow (see langflow/sdoh_assistant.json)."""
    context = build_sdoh_context(db_session) if db_session else "(none)"
    payload = {
        "input_value": message,
        "input_type": "chat",
        "output_type": "chat",
        "tweaks": {
            LANGFLOW_PROMPT_NODE: {
                "sdoh_context": context,
                "language": "Spanish" if language == "es" else "English",
            }
        },
    }
    if session_id:
        payload["session_id"] = session_id

    headers = {"x-api-key": LANGFLOW_API_KEY} if LANGFLOW_API_KEY else {}
    response = requests.post(
        f"{LANGFLOW_BASE_URL}/api/v1/run/{LANGFLOW_FLOW_ID}",
        json=payload,
        headers=headers,
        timeout=LANGFLOW_TIMEOUT,
    )
    response.raise_for_status()
    data = response.json()
    try:
        return data["outputs"][0]["outputs"][0]["results"]["message"]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        logger.error("Respuesta inesperada de Langflow: %s", data)
        raise RuntimeError("Respuesta inesperada de Langflow") from exc


def chat_with_openai(message: str, language: str = "es", db_session=None) -> str:
    """Send a message to OpenAI with SDOH context and return the response."""
    system_prompt = SYSTEM_PROMPT_ES if language == "es" else SYSTEM_PROMPT_EN
    messages = [{"role": "system", "content": system_prompt}]

    if db_session:
        context = build_sdoh_context(db_session)
        messages.append({"role": "system", "content": f"Current database context:\n{context}"})

    messages.append({"role": "user", "content": message})

    response = client.chat.completions.create(
        model=os.getenv("AI_MODEL", "gpt-4o-mini"),
        messages=messages,
        max_tokens=800,
        temperature=0.7,
    )

    return response.choices[0].message.content
