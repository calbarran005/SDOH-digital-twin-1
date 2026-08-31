"""
ETL pipeline for public SDOH datasets.

This module scaffolds the real integration with:
  - CDC PLACES (https://data.cdc.gov) - health outcomes and SDOH by tract/ZCTA
  - Census ACS API (https://api.census.gov) - socioeconomic data by census tract

Because downloading the full public datasets requires API keys / internet and can
take significant time & storage, we provide:
  1. `ingest_cdc_places_csv(filepath)` - imports a local CDC PLACES CSV dump
  2. `ingest_acs_json(data)` - imports ACS-style records as dicts
  3. `run_demo_pipeline()` - loads the synthetic demo dataset (seed.py)

To use real data:
  - Download PLACES CSV (https://data.cdc.gov/browse?q=PLACES)
  - Save to backend/data/raw/places.csv
  - Run: `python -m app.scripts.etl_pipeline --cdc backend/data/raw/places.csv`
"""

import argparse
import os

from app.core.database import SessionLocal
from app.models.geo import CensusTract
from app.models.sdoh import IndicatorCatalog, SDOHIndicator

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "raw")
os.makedirs(RAW_DIR, exist_ok=True)


def resolve_tract(db, geoid):
    return db.query(CensusTract).filter(CensusTract.geoid == geoid).first()


def ingest_cdc_places_csv(db, filepath, year=2022):
    """Import a CDC PLACES CSV. Expected columns: LocationID, Measure, Data_Value."""
    try:
        import pandas as pd
    except ImportError:
        raise RuntimeError("pandas requerido para ETL real")
    df = pd.read_csv(filepath)
    count = 0
    for _, row in df.iterrows():
        geoid = str(row.get("LocationID", "")).strip()
        measure = str(row.get("Measure", "")).strip()
        value = row.get("Data_Value")
        if not geoid or not measure or pd.isna(value):
            continue
        tract = resolve_tract(db, geoid)
        item = db.query(IndicatorCatalog).filter(IndicatorCatalog.code == measure).first()
        if not tract or not item:
            continue
        db.add(
            SDOHIndicator(
                tract_id=tract.id, catalog_id=item.id, year=year,
                value=float(value),
            )
        )
        count += 1
    db.commit()
    return count


def run_demo_pipeline():
    """Load the demo dataset (requires running seed first)."""
    from app.scripts.seed import seed
    seed()


def main():
    parser = argparse.ArgumentParser(description="ETL de datasets públicos SDOH")
    parser.add_argument("--cdc", help="Ruta a CSV de CDC PLACES")
    parser.add_argument("--demo", action="store_true", help="Cargar dataset demo")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        if args.demo:
            run_demo_pipeline()
        if args.cdc:
            n = ingest_cdc_places_csv(db, args.cdc)
            print(f"Importados {n} registros CDC PLACES")
    finally:
        db.close()


if __name__ == "__main__":
    main()
