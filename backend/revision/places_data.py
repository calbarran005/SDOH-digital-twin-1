"""Carga sin base de datos del dataset CDC PLACES usado en el artículo SP-5.

Reproduce la tabla ancha de ``ml_service.build_dataset`` (último año disponible por
medida) a partir de los CSV que el ETL guarda en ``backend/data/raw`` y añade los
límites de confianza (MOE) y el centroide de cada tract.
"""
from __future__ import annotations

import ast
import os
import re

import numpy as np
import pandas as pd

from app.scripts.etl_pipeline import CDC_MEASURE_MAP

RAW = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
FILES = ["places_cdc_36061-17031.csv", "places_cdc_2022.csv"]
COUNTY = {"17031": "Cook County", "36061": "New York County"}


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").lower().replace("–", "-").replace("—", "-")).strip()


MEASURE_TO_CODE = {_norm(m): code for m, code, *_ in CDC_MEASURE_MAP}
ALL_CODES = [code for _m, code, *_ in CDC_MEASURE_MAP]
HIGHER_IS_BETTER = {code: hib for _m, code, _n, _d, hib, _t in CDC_MEASURE_MAP}


def load_long() -> pd.DataFrame:
    frames = []
    for f in FILES:
        d = pd.read_csv(os.path.join(RAW, f), low_memory=False)
        if "year" not in d.columns:
            d["year"] = 2022
        frames.append(d)
    d = pd.concat(frames, ignore_index=True)
    d["code"] = d["measure"].map(lambda m: MEASURE_TO_CODE.get(_norm(m)))
    d["geoid"] = d["locationid"].astype(str).str.zfill(11)
    for c in ("data_value", "low_confidence_limit", "high_confidence_limit"):
        d[c] = pd.to_numeric(d[c], errors="coerce")
    d = d.dropna(subset=["code", "data_value"])
    return d


def load_wide(codes=None):
    """Devuelve (valores, se, meta) con una fila por tract ordenada por GEOID."""
    d = load_long()
    if codes is not None:
        d = d[d["code"].isin(codes)]
    d = d.sort_values("year", ascending=False).drop_duplicates(["geoid", "code"], keep="first")
    val = d.pivot(index="geoid", columns="code", values="data_value").sort_index()
    se = ((d["high_confidence_limit"] - d["low_confidence_limit"]) / (2 * 1.959964)).rename("se")
    se = d.assign(se=se).pivot(index="geoid", columns="code", values="se").reindex(val.index)
    meta = d.drop_duplicates("geoid").set_index("geoid").reindex(val.index)
    xy = meta["geolocation"].map(lambda g: ast.literal_eval(g)["coordinates"] if isinstance(g, str) else [np.nan, np.nan])
    meta = pd.DataFrame(
        {
            "county": [COUNTY[g[:5]] for g in val.index],
            "lon": [p[0] for p in xy],
            "lat": [p[1] for p in xy],
            "pop": pd.to_numeric(meta["totalpopulation"], errors="coerce").values,
            "pop18": pd.to_numeric(meta["totalpop18plus"], errors="coerce").values,
        },
        index=val.index,
    )
    return val, se, meta


def model_frame():
    """Tabla ancha equivalente a ``data.load_from_db().df`` (geoid, name, county, X, y)."""
    from app.services import ml_service

    codes = list(ml_service.FEATURES) + list(ml_service.TARGETS)
    val, se, meta = load_wide()
    df = val.reindex(columns=codes).reset_index()
    df.insert(1, "name", df["geoid"])
    df["county"] = meta["county"].values
    return df, val, se, meta
