from typing import Dict, List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.sdoh import EquityIndex, IndicatorCatalog, SDOHIndicator


def _normalize(values: List[float]) -> Dict[float, float]:
    """Map raw values 0-100 national distribution to 0-1 scores."""
    if not values:
        return {}
    mn, mx = min(values), max(values)
    span = (mx - mn) or 1.0
    return {v: (v - mn) / span for v in values}


def compute_z_scores(
    db: Session, catalog_id: int, year: int
) -> Dict[int, float]:
    """Compute z-scores of an indicator across all tracts for a year."""
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
    import statistics

    mean = statistics.mean(values)
    stdev = statistics.stdev(values) if len(values) > 1 else 0.0
    return {r[0]: (r[1] - mean) / stdev if stdev else 0.0 for r in rows}


def compute_equity_indexes(
    db: Session, year: int, weights: Optional[Dict[str, float]] = None
) -> int:
    """Compute composite equity index per tract for a year and store results.

    Uses a weighted composite of normalized SDOH indicators across domains,
    separated into protective (higher=better) and risk (lower=better) factors.
    """
    catalog = db.query(IndicatorCatalog).all()
    if not catalog:
        return 0

    # Weight normalisation
    if weights:
        wsum = sum(weights.values()) or 1.0
        w = {k: v / wsum for k, v in weights.items()}
    else:
        w = {c.code: c.weight for c in catalog}
        wsum = sum(w.values()) or 1.0
        w = {k: v / wsum for k, v in w.items()}

    # Collect all tract_ids
    tract_ids = {
        r[0]
        for r in db.query(SDOHIndicator.tract_id)
        .filter(SDOHIndicator.year == year)
        .distinct()
        .all()
    }

    # Normalise each indicator across tracts
    normalised = {}  # code -> {tract_id: 0-1}
    domain_info = {}
    for item in catalog:
        normalised[item.code] = _normalize(
            [
                v
                for v, in db.query(SDOHIndicator.value)
                .filter(
                    SDOHIndicator.catalog_id == item.id,
                    SDOHIndicator.year == year,
                )
                .all()
            ]
        )
        domain_info[item.code] = item

    created = 0
    for t in tract_ids:
        # composite: protective indicators as-is; risk indicators inverted (1-x)
        composite = 0.0
        for code, norm in normalised.items():
            if code not in w:
                continue
            if code not in norm:
                continue
            item = domain_info[code]
            val = norm.get(t)
            if val is None:
                continue
            if item.higher_is_better == 1:
                composite += w[code] * val
            else:
                composite += w[code] * (1 - val)
        # global percentile
        all_composites = []
        for t2 in tract_ids:
            c2 = 0.0
            for code, norm in normalised.items():
                if code not in w or code not in norm:
                    continue
                item = domain_info[code]
                val = norm.get(t2)
                if val is None:
                    continue
                c2 += w[code] * (val if item.higher_is_better == 1 else 1 - val)
            all_composites.append(c2)
        perc = _percentile_of(all_composites, composite)

        # risk level
        risk = _risk_level(100 - perc)

        idx = EquityIndex(
            tract_id=t,
            year=year,
            domain="composite",
            index_type="composite_equity",
            value=round(composite, 4),
            percentile=round(100 - perc, 2),  # vulnerability percentile
            risk_level=risk,
            method="weighted_normalized_composite",
        )
        db.add(idx)
        created += 1

    db.commit()
    return created


def _percentile_of(values: List[float], value: float) -> float:
    if not values:
        return 50.0
    below = sum(1 for v in values if v < value)
    return (below / len(values)) * 100


def _risk_level(perc: float) -> str:
    if perc >= 90:
        return "critical"
    if perc >= 75:
        return "high"
    if perc >= 50:
        return "moderate"
    return "low"
