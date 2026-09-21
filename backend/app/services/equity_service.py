"""CRISP-DM Fase IV (Modelado): índices compuestos de equidad por tracto censal.

El índice de un tracto es la suma ponderada de sus indicadores normalizados:

    E_t = Σ_k w_k · s_{k,t}      s_{k,t} = x̃_{k,t}      si el indicador es protector
                                 s_{k,t} = 1 − x̃_{k,t}  si el indicador es de riesgo
    V_t = 100 − P_E(E_t)         (percentil de vulnerabilidad)

donde x̃ es la normalización mínimo-máximo del indicador sobre el conjunto de tractos
del año analizado y los pesos w se normalizan a suma unitaria.
"""

import statistics
from bisect import bisect_left
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from sqlalchemy.orm import Session

from app.models.sdoh import EquityIndex, IndicatorCatalog, SDOHIndicator

METHOD = "weighted_normalized_composite"
DEFAULT_INDEX_TYPE = "composite_equity"

#: Umbrales de estratificación sobre el percentil de vulnerabilidad (0-100).
RISK_THRESHOLDS: Sequence[Tuple[float, str]] = (
    (90.0, "critical"),
    (75.0, "high"),
    (50.0, "moderate"),
)


def _normalize(pairs: Iterable[Tuple[int, float]]) -> Dict[int, float]:
    """Escala mínimo-máximo a [0, 1] devolviendo un mapa ``tract_id -> score``."""
    pairs = list(pairs)
    if not pairs:
        return {}
    values = [v for _, v in pairs]
    mn, mx = min(values), max(values)
    span = (mx - mn) or 1.0
    return {tract_id: (value - mn) / span for tract_id, value in pairs}


def compute_z_scores(db: Session, catalog_id: int, year: int) -> Dict[int, float]:
    """Puntuaciones tipificadas de un indicador sobre todos los tractos de un año."""
    rows = (
        db.query(SDOHIndicator.tract_id, SDOHIndicator.value)
        .filter(
            SDOHIndicator.catalog_id == catalog_id,
            SDOHIndicator.year == year,
        )
        .all()
    )
    if not rows:
        return {}
    values = [r[1] for r in rows]
    mean = statistics.mean(values)
    stdev = statistics.stdev(values) if len(values) > 1 else 0.0
    return {r[0]: ((r[1] - mean) / stdev if stdev else 0.0) for r in rows}


def normalized_weights(
    catalog: List[IndicatorCatalog], weights: Optional[Dict[str, float]] = None
) -> Dict[str, float]:
    """Normaliza los pesos a suma unitaria (los explícitos tienen prioridad)."""
    raw = weights if weights else {c.code: (c.weight or 0.0) for c in catalog}
    raw = {k: v for k, v in raw.items() if v}
    total = sum(raw.values())
    if not total:
        return {}
    return {k: v / total for k, v in raw.items()}


def build_normalized_matrix(
    db: Session, year: int, catalog: List[IndicatorCatalog]
) -> Dict[str, Dict[int, float]]:
    """Fase III: matriz ``código de indicador -> {tract_id: valor normalizado}``.

    Los indicadores de riesgo (``higher_is_better = 0``) se complementan a la unidad
    para que todas las variables queden orientadas en sentido protector.
    """
    matrix: Dict[str, Dict[int, float]] = {}
    for item in catalog:
        rows = (
            db.query(SDOHIndicator.tract_id, SDOHIndicator.value)
            .filter(
                SDOHIndicator.catalog_id == item.id,
                SDOHIndicator.year == year,
            )
            .all()
        )
        scores = _normalize(rows)
        if item.higher_is_better != 1:
            scores = {tract_id: 1.0 - s for tract_id, s in scores.items()}
        matrix[item.code] = scores
    return matrix


def composite_scores(
    matrix: Dict[str, Dict[int, float]], weights: Dict[str, float]
) -> Dict[int, float]:
    """Compuesto ponderado por tracto. Coste O(n · k)."""
    composites: Dict[int, float] = {}
    for code, weight in weights.items():
        for tract_id, score in matrix.get(code, {}).items():
            composites[tract_id] = composites.get(tract_id, 0.0) + weight * score
    return composites


def compute_composites(
    db: Session, year: int, weights: Optional[Dict[str, float]] = None
) -> Tuple[Dict[int, float], Dict[str, Dict[int, float]], Dict[str, float]]:
    """Ejecuta preparación + modelado sin persistir. Reutilizado por la Fase V."""
    catalog = db.query(IndicatorCatalog).all()
    if not catalog:
        return {}, {}, {}
    w = normalized_weights(catalog, weights)
    matrix = build_normalized_matrix(db, year, catalog)
    return composite_scores(matrix, w), matrix, w


def compute_equity_indexes(
    db: Session,
    year: int,
    weights: Optional[Dict[str, float]] = None,
    index_type: str = DEFAULT_INDEX_TYPE,
) -> int:
    """Calcula y persiste el índice compuesto por tracto para un año.

    La recomputación es idempotente: reemplaza los índices previos del mismo año y
    tipo, de acuerdo con la restricción de unicidad (tract_id, year, index_type).
    """
    composites, _matrix, _w = compute_composites(db, year, weights)
    if not composites:
        return 0

    ordered = sorted(composites.values())

    db.query(EquityIndex).filter(
        EquityIndex.year == year,
        EquityIndex.index_type == index_type,
    ).delete(synchronize_session=False)

    rows = []
    for tract_id, composite in composites.items():
        vulnerability = 100.0 - _percentile_of(ordered, composite)
        rows.append(
            EquityIndex(
                tract_id=tract_id,
                year=year,
                domain="composite",
                index_type=index_type,
                value=round(composite, 4),
                percentile=round(vulnerability, 2),
                risk_level=risk_level(vulnerability),
                method=METHOD,
            )
        )
    db.add_all(rows)
    db.commit()
    return len(rows)


def _percentile_of(sorted_values: Sequence[float], value: float) -> float:
    """Porcentaje de observaciones estrictamente menores. ``sorted_values`` ordenado."""
    if not sorted_values:
        return 50.0
    return (bisect_left(sorted_values, value) / len(sorted_values)) * 100


def risk_level(vulnerability_percentile: float) -> str:
    """Estratifica el percentil de vulnerabilidad en cuatro niveles."""
    for threshold, level in RISK_THRESHOLDS:
        if vulnerability_percentile >= threshold:
            return level
    return "low"


#: Alias retrocompatible.
_risk_level = risk_level
