"""Resumen ejecutivo generado con LangChain para los reportes SDOH.

El resumen es *opcional*: si falta la API key, si `REPORT_AI_SUMMARY=false` o si el
modelo falla, `build_executive_summary` devuelve None y el reporte se genera igual
que antes (solo tablas y gráfico). La generación de reportes nunca debe romperse
por un problema del LLM.
"""

import logging
import os
import statistics

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.models.sdoh import IndicatorCatalog

logger = logging.getLogger(__name__)

REPORT_AI_SUMMARY = os.getenv("REPORT_AI_SUMMARY", "true").lower() in ("1", "true", "yes")
AI_MODEL = os.getenv("AI_MODEL", "gpt-4o-mini")

# Cuántos elementos se le piden al modelo y cuántos tracts entran en el digest
MAX_INDICADORES_DIGEST = 25
TOP_TRACTS_DIGEST = 5


class ResumenEjecutivo(BaseModel):
    """Salida estructurada del LLM. Cada campo va a una sección del reporte."""

    panorama: str = Field(
        description=(
            "Dos o tres frases describiendo el estado general del área de captación: "
            "cobertura (tracts y población), dominios más comprometidos y nivel de "
            "riesgo predominante. Sin viñetas."
        )
    )
    hallazgos: list[str] = Field(
        description=(
            "Entre 3 y 5 hallazgos. Cada uno DEBE citar al menos un valor numérico "
            "textual del contexto (media, mínimo, máximo, número de tracts o percentil). "
            "Una frase por hallazgo."
        )
    )
    poblaciones_riesgo: list[str] = Field(
        description=(
            "Entre 2 y 4 grupos o zonas priritarias, identificando los census tracts "
            "por su GEOID y su percentil de vulnerabilidad cuando aparezcan en el contexto."
        )
    )
    recomendaciones: list[str] = Field(
        description=(
            "Entre 3 y 5 recomendaciones accionables de salud pública, ancladas a los "
            "indicadores concretos del contexto. Nada genérico."
        )
    )
    limitaciones: str = Field(
        description=(
            "Dos o tres frases advirtiendo que los datos de CDC PLACES son estimaciones "
            "modeladas a nivel de área pequeña (small-area estimation con BRFSS + Census ACS), "
            "no conteos observados, y que no deben usarse para decisiones clínicas individuales."
        )
    )


SYSTEM_PROMPT = """Eres un analista de salud pública redactando el resumen ejecutivo de un
reporte sobre Determinantes Sociales de la Salud (SDOH) para un área de captación hospitalaria.

Reglas estrictas:
- Usa ÚNICAMENTE los datos del contexto. Nunca inventes cifras, tracts, hospitales ni tendencias.
- Si el contexto no incluye una serie temporal, no hables de aumentos, descensos ni evolución.
- Cita los valores tal como aparecen en el contexto, con su unidad (prevalencia % en adultos).
- Las medias son promedios de prevalencia ENTRE census tracts, no proporciones de la población
  total. Escribe "media de 23.8% entre los tracts" o "prevalencia media del 23.8%".
  NUNCA escribas "el 23.8% de la población" ni "el 23.8% de los adultos".
- "N/M tracts fuera de umbral" significa que N tracts cruzan el umbral en el sentido
  DESFAVORABLE. Repórtalo con esas palabras; no lo reinterpretes como "por encima" ni
  "por debajo", porque la dirección depende del indicador.
- Escribe en español, en registro técnico y neutro, sin adjetivos alarmistas.
- No repitas el mismo indicador en varios hallazgos."""

HUMAN_PROMPT = """Contexto del reporte:

{digest}

Redacta el resumen ejecutivo."""


def _bad_direction(higher_is_better, value, threshold) -> bool:
    """True si `value` cruza el umbral de alerta en el sentido desfavorable."""
    if threshold is None or value is None:
        return False
    if higher_is_better:
        return value < threshold
    return value > threshold


def _build_digest(db: Session, rows, by_domain, hospital, catchment, year) -> str:
    """Comprime las filas del reporte en un contexto corto y numérico para el LLM.

    No se le pasan las filas crudas (pueden ser miles): solo agregados por dominio,
    por indicador y la distribución de riesgo de equidad.
    """
    partes = []

    # --- Cabecera ---
    tracts = {r["tract_geoid"] for r in rows if r.get("tract_geoid")}
    poblacion = sum({
        r["tract_geoid"]: r["population"]
        for r in rows
        if r.get("tract_geoid") and r.get("population")
    }.values())
    partes.append(
        f"Hospital: {hospital.name if hospital else 'Red General'}\n"
        f"Área de captación: {catchment.name if catchment else 'General'}"
        + (f" (radio {catchment.radius_km} km)" if catchment and catchment.radius_km else "")
        + f"\nAño evaluado: {year}\n"
        f"Census tracts: {len(tracts)}, población cubierta: {poblacion:,}\n"
        f"Fuente: CDC PLACES (estimaciones modeladas de prevalencia en adultos, %)."
    )

    # --- Agregados por dominio ---
    lineas = []
    for dom, valores in (by_domain or {}).items():
        if not valores:
            continue
        lineas.append(
            f"- {dom}: media={statistics.mean(valores):.1f}, min={min(valores):.1f}, "
            f"max={max(valores):.1f}, n={len(valores)}"
        )
    if lineas:
        partes.append("Dominios SDOH:\n" + "\n".join(lineas))

    # --- Agregados por indicador, con umbral de alerta del catálogo ---
    por_codigo = {}
    for r in rows:
        code = r.get("indicator_code")
        if code and r.get("value") is not None:
            por_codigo.setdefault(code, {"name": r.get("indicator_name"), "domain": r.get("domain"), "values": []})
            por_codigo[code]["values"].append(r["value"])

    catalogo = {
        c.code: c
        for c in db.query(IndicatorCatalog).filter(IndicatorCatalog.code.in_(por_codigo.keys())).all()
    } if por_codigo else {}

    lineas = []
    for code, info in por_codigo.items():
        valores = info["values"]
        media = statistics.mean(valores)
        item = catalogo.get(code)
        extra = ""
        if item is not None and item.threshold_alert is not None:
            hib = bool(item.higher_is_better)
            n_alerta = sum(1 for v in valores if _bad_direction(hib, v, item.threshold_alert))
            extra = (
                f", umbral alerta={item.threshold_alert} "
                f"({'mayor es mejor' if hib else 'menor es mejor'}), "
                f"{n_alerta}/{len(valores)} tracts fuera de umbral"
            )
        lineas.append(
            f"- {code} | {info['name']} | dominio {info['domain']} | "
            f"media={media:.1f}, min={min(valores):.1f}, max={max(valores):.1f}, n={len(valores)}{extra}"
        )
    # Los indicadores con media más alta primero: son los que sostienen el resumen
    lineas.sort(key=lambda s: float(s.split("media=")[1].split(",")[0]), reverse=True)
    if lineas:
        partes.append(
            f"Indicadores (top {MAX_INDICADORES_DIGEST} por media):\n"
            + "\n".join(lineas[:MAX_INDICADORES_DIGEST])
        )

    # --- Equidad: distribución de riesgo y tracts más vulnerables ---
    por_tract = {}
    for r in rows:
        geoid = r.get("tract_geoid")
        if geoid and geoid not in por_tract:
            por_tract[geoid] = r

    dist = {}
    for r in por_tract.values():
        nivel = r.get("risk_level") or "Desconocido"
        dist[nivel] = dist.get(nivel, 0) + 1
    if dist:
        partes.append(
            "Índice de equidad compuesto, tracts por nivel de riesgo:\n"
            + ", ".join(f"{k}={v}" for k, v in sorted(dist.items(), key=lambda kv: -kv[1]))
        )

    vulnerables = sorted(
        (r for r in por_tract.values() if r.get("percentile") is not None),
        key=lambda r: r["percentile"],
        reverse=True,
    )[:TOP_TRACTS_DIGEST]
    if vulnerables:
        partes.append(
            f"Top {len(vulnerables)} tracts más vulnerables (percentil 100 = más vulnerable):\n"
            + "\n".join(
                f"- {r['tract_geoid']} (pobl. {r.get('population') or 's/d'}): "
                f"percentil={r['percentile']:.0f}, riesgo={r.get('risk_level') or 's/d'}"
                for r in vulnerables
            )
        )

    return "\n\n".join(partes)


def build_executive_summary(
    db: Session, rows, by_domain, hospital, catchment, year
) -> ResumenEjecutivo | None:
    """Genera el resumen ejecutivo del reporte, o None si no está disponible."""
    if not REPORT_AI_SUMMARY:
        return None
    if not os.getenv("OPENAI_API_KEY"):
        logger.info("Resumen ejecutivo omitido: no hay OPENAI_API_KEY configurada.")
        return None
    if not rows:
        return None

    try:
        from langchain.chat_models import init_chat_model
        from langchain_core.prompts import ChatPromptTemplate

        llm = init_chat_model(AI_MODEL, temperature=0.2)
        prompt = ChatPromptTemplate.from_messages(
            [("system", SYSTEM_PROMPT), ("human", HUMAN_PROMPT)]
        )
        chain = prompt | llm.with_structured_output(ResumenEjecutivo)
        digest = _build_digest(db, rows, by_domain, hospital, catchment, year)
        return chain.invoke({"digest": digest})
    except Exception as exc:  # el reporte se entrega igual sin resumen
        logger.warning("No se pudo generar el resumen ejecutivo: %s", exc)
        return None
