from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class IndicatorCatalogIn(BaseModel):
    code: str
    name: str
    domain: Optional[str] = None
    source: Optional[str] = None
    description: Optional[str] = None
    unit: Optional[str] = None
    higher_is_better: int = 1
    weight: float = 1.0
    threshold_alert: Optional[float] = None


class IndicatorCatalogOut(IndicatorCatalogIn):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SDOHValueIn(BaseModel):
    tract_geoid: str
    catalog_code: str
    year: int
    value: float
    low_ci: Optional[float] = None
    high_ci: Optional[float] = None
    sample_size: Optional[int] = None


class EquityIndexOut(BaseModel):
    id: int
    tract_id: int
    year: int
    domain: Optional[str] = None
    index_type: str
    value: float
    percentile: Optional[float] = None
    risk_level: Optional[str] = None

    class Config:
        from_attributes = True


class AlertRuleIn(BaseModel):
    name: str
    catalog_id: Optional[int] = None
    domain: Optional[str] = None
    comparison: str = "gt"
    threshold: float
    severity: str = "high"
    enabled: str = "true"
    description: Optional[str] = None


class AlertRuleOut(AlertRuleIn):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AlertOut(BaseModel):
    id: int
    severity: Optional[str] = None
    status: str
    indicator_code: Optional[str] = None
    indicator_name: Optional[str] = None
    observed_value: Optional[float] = None
    message: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class EquityScoreRequest(BaseModel):
    year: int = Field(default=2022)
    weights: Optional[dict] = None
