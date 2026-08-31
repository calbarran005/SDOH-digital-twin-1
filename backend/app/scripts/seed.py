"""Create all tables + seed demo data for immediate use."""

import random
from datetime import datetime

from app.core.database import Base, SessionLocal, engine
from app.models import domain  # noqa: F401
from app.models.geo import (
    CensusTract,
    County,
    Hospital,
    HospitalCatchment,
    CatchmentMembership,
)
from app.models.sdoh import (
    EquityIndex,
    IndicatorCatalog,
    SDOHIndicator,
    Alert,
)

SDOH_INDICATORS = [
    ("pct_unemployed", "Desempleo (%)", "Empleo", "Census-ACS", 0),
    ("median_household_income", "Ingreso medio del hogar (USD)", "Ingreso", "Census-ACS", 1),
    ("pct_below_poverty", "Población bajo el nivel de pobreza (%)", "Ingreso", "Census-ACS", 0),
    ("pct_no_health_insurance", "Sin seguro médico (%)", "Acceso a salud", "CDC-PLACES", 0),
    ("pct_obesity", "Obesidad (%)", "Salud crónica", "CDC-PLACES", 0),
    ("pct_diabetes", "Diabetes (%)", "Salud crónica", "CDC-PLACES", 0),
    ("pct_inactivity", "Inactividad física (%)", "Comportamiento", "CDC-PLACES", 0),
    ("pct_no_hs_degree", "Sin título de secundaria (%)", "Educación", "Census-ACS", 0),
    ("pct_severe_housing", "Problemas severos de vivienda (%)", "Vivienda", "Census-ACS", 0),
    ("pct_no_car", "Hogares sin vehículo (%)", "Transporte", "Census-ACS", 0),
    ("pct_food_insecurity", "Inseguridad alimentaria (%)", "Alimentación", "CDC-PLACES", 0),
    ("pct_linguistic_isolation", "Aislamiento lingüístico (%)", "Social", "Census-ACS", 0),
]


def seed():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        random.seed(42)

        # --- Counties ---
        counties = [
            County(geoid="36061", name="New York County", state_fips="36", county_fips="061", state_name="New York"),
            County(geoid="17031", name="Cook County", state_fips="17", county_fips="031", state_name="Illinois"),
        ]
        db.add_all(counties)
        db.commit()

        # --- Catalog ---
        catalog_objs = []
        for code, name, domain_, source, hib in SDOH_INDICATORS:
            cat = IndicatorCatalog(
                code=code, name=name, domain=domain_, source=source,
                higher_is_better=hib, threshold_alert=(10 if hib == 0 else None),
            )
            db.add(cat)
            catalog_objs.append(cat)
        db.commit()
        code_map = {c.code: c for c in catalog_objs}

        # --- Hospitals ---
        h1 = Hospital(
            name="Metropolitan General Hospital", slug="metropolitan-general",
            city="New York", state="NY", zip_code="10001",
            latitude=40.75, longitude=-73.98,
        )
        h2 = Hospital(
            name="Lakefront Community Medical Center", slug="lakefront-community",
            city="Chicago", state="IL", zip_code="60601",
            latitude=41.88, longitude=-87.62,
        )
        db.add(h1)
        db.add(h2)
        db.commit()

        n_tracts = 80
        # --- Census tracts around each hospital, + indicators ---
        for hi, hospital, cx, cy, county in [
            (h1.id, h1, -73.98, 40.75, counties[0]),
            (h2.id, h2, -87.62, 41.88, counties[1]),
        ]:
            catchment = HospitalCatchment(
                hospital_id=hi, name=f"{hospital.name} - Catchment",
                catchment_type="radius", radius_km=12,
            )
            db.add(catchment)
            db.commit()

            for i in range(n_tracts):
                geoid = f"{county.state_fips}{county.county_fips}{i:06d}"
                lon = cx + random.uniform(-0.08, 0.08)
                lat = cy + random.uniform(-0.06, 0.06)
                pop = random.randint(2000, 12000)
                tract = CensusTract(
                    geoid=geoid, name=f"Tract {i}",
                    state_fips=county.state_fips, county_fips=county.county_fips,
                    county_id=county.id, total_population=pop,
                    land_area=random.uniform(0.2, 1.5),
                )
                db.add(tract)
                db.commit()
                db.refresh(tract)

                # indicator values with spatial autocorrelation (poorer near edge)
                distance_ratio = i / n_tracts
                for code, name, domain_, source, hib in SDOH_INDICATORS:
                    base = 5 + distance_ratio * random.uniform(0, 20)
                    noise = random.gauss(0, 1.5)
                    value = max(0.1, base + noise)
                    if code == "median_household_income":
                        value = max(20000, 90000 - distance_ratio * 60000 + random.gauss(0, 4000))
                    db.add(
                        SDOHIndicator(
                            tract_id=tract.id,
                            catalog_id=code_map[code].id,
                            year=2022,
                            value=round(value, 2),
                            low_ci=round(value - 1.5, 2),
                            high_ci=round(value + 1.5, 2),
                        )
                    )
                db.add(CatchmentMembership(catchment_id=catchment.id, tract_id=tract.id))
            db.commit()

        # --- Equity indexes ---
        all_tracts = db.query(CensusTract).all()
        for t in all_tracts:
            db.add(
                EquityIndex(
                    tract_id=t.id, year=2022, domain="composite",
                    index_type="composite_equity",
                    value=round(random.uniform(0.2, 0.9), 4),
                    percentile=round(random.uniform(0, 100), 2),
                    risk_level=random.choice(["low", "moderate", "high", "critical"]),
                    method="seed_demo",
                )
            )
        db.commit()

        # --- Sample alerts ---
        for _ in range(8):
            t = random.choice(all_tracts)
            item = random.choice(catalog_objs)
            db.add(
                Alert(
                    tract_id=t.id,
                    indicator_code=item.code,
                    indicator_name=item.name,
                    observed_value=round(random.uniform(10, 45), 2),
                    severity=random.choice(["medium", "high", "critical"]),
                    status="open",
                    message=f"{item.name} supera umbral en tract {t.name}",
                )
            )
        db.commit()

        print("Seed completado:")
        print(f"  - {db.query(County).count()} condados")
        print(f"  - {db.query(Hospital).count()} hospitales")
        print(f"  - {db.query(CensusTract).count()} census tracts")
        print(f"  - {db.query(SDOHIndicator).count()} valores SDOH")
        print(f"  - {db.query(EquityIndex).count()} índices de equidad")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
