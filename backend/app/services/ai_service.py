import logging
import os

from openai import OpenAI

logger = logging.getLogger(__name__)


client = OpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))

SYSTEM_PROMPT_EN = """You are a specialized SDOH (Social Determinants of Health) assistant for a Digital Twin platform.
You have access to data about hospitals, census tracts, equity indices, and health alerts for a metropolitan area.
Answer concisely and technically in English. Use data context when available.
If you don't have enough data, say so clearly. Never fabricate statistics."""

SYSTEM_PROMPT_ES = """Eres un asistente especializado en SDOH (Determinantes Sociales de la Salud) para una plataforma de Gemelo Digital.
Tienes acceso a datos de hospitales, census tracts, índices de equidad y alertas de salud de un área metropolitana.
Responde de forma concisa y técnica en español. Usa el contexto de datos cuando esté disponible.
Si no tienes suficientes datos, dilo claramente. Nunca fabriques estadísticas."""


def build_sdoh_context(db_session) -> str:
    """Build a context string from the database for RAG-style prompting."""
    from sqlalchemy.exc import SQLAlchemyError

    from app.models.geo import CensusTract, Hospital, HospitalCatchment
    from app.models.sdoh import Alert, EquityIndex, IndicatorCatalog, SDOHIndicator

    context_parts = []
    try:
        hospital_count = db_session.query(Hospital).count()
        tract_count = db_session.query(CensusTract).count()
        catchment_count = db_session.query(HospitalCatchment).count()
        context_parts.append(
            f"Hospitals: {hospital_count}, Census Tracts: {tract_count}, "
            f"Catchment Areas: {catchment_count}"
        )

        indicators = (
            db_session.query(
                IndicatorCatalog.code,
                CensusTract.geoid,
                SDOHIndicator.value,
                SDOHIndicator.year,
            )
            .join(IndicatorCatalog, SDOHIndicator.catalog_id == IndicatorCatalog.id)
            .join(CensusTract, SDOHIndicator.tract_id == CensusTract.id)
            .order_by(SDOHIndicator.year.desc(), SDOHIndicator.id.desc())
            .limit(10)
            .all()
        )
        if indicators:
            ind_list = [
                f"- {code}: value={value}, tract={geoid}, year={year}"
                for code, geoid, value, year in indicators
            ]
            context_parts.append("Recent SDOH Indicators:\n" + "\n".join(ind_list))

        equity = (
            db_session.query(
                CensusTract.geoid,
                EquityIndex.value,
                EquityIndex.percentile,
                EquityIndex.risk_level,
            )
            .join(CensusTract, EquityIndex.tract_id == CensusTract.id)
            .filter(EquityIndex.percentile.is_not(None))
            .order_by(EquityIndex.percentile.desc())
            .limit(5)
            .all()
        )
        if equity:
            eq_list = [
                f"- Tract {geoid}: index={value:.3f}, "
                f"vulnerability_pct={percentile}, risk={risk}"
                for geoid, value, percentile, risk in equity
            ]
            context_parts.append("Top Vulnerable Tracts:\n" + "\n".join(eq_list))

        alerts = (
            db_session.query(Alert).filter(Alert.status == "open").limit(5).all()
        )
        if alerts:
            al_list = [
                f"- {a.indicator_name}: severity={a.severity}, value={a.observed_value}"
                for a in alerts
            ]
            context_parts.append("Open Alerts:\n" + "\n".join(al_list))
    except SQLAlchemyError as exc:
        logger.warning("No se pudo construir el contexto SDOH: %s", exc)
        context_parts.append("(Database context unavailable)")

    return "\n\n".join(context_parts)


def chat_with_ai(message: str, language: str = "es", db_session=None) -> str:
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
