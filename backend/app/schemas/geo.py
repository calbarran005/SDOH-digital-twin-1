from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


# --- Census / Geo ---
class CountyOut(BaseModel):
    id: int
    geoid: str
    name: str
    state_fips: Optional[str] = None
    state_name: Optional[str] = None

    class Config:
        from_attributes = True


class GeoFeature(BaseModel):
    type: str = "Feature"
    properties: dict = {}
    geometry: Optional[dict] = None


class GeoFeatureCollection(BaseModel):
    type: str = "FeatureCollection"
    features: List[GeoFeature] = []


class TractSummary(BaseModel):
    geoid: str
    name: Optional[str] = None
    total_population: Optional[int] = None
    county_name: Optional[str] = None
    state_name: Optional[str] = None


class HospitalIn(BaseModel):
    name: str
    slug: Optional[str] = None
    cms_id: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    description: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class HospitalOut(HospitalIn):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CatchmentIn(BaseModel):
    hospital_id: int
    name: str
    catchment_type: str = "radius"
    radius_km: Optional[float] = None
    description: Optional[str] = None


class CatchmentOut(CatchmentIn):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
