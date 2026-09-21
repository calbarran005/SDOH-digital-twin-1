from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.core.database import Base


class IndicatorCatalog(Base):
    """Master catalog of SDOH / health indicators across datasets."""

    __tablename__ = "indicator_catalog"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(100), unique=True, nullable=False, index=True)
    name = Column(String(300), nullable=False)
    domain = Column(String(100), nullable=True)  # Housing, Income, Education, ...
    source = Column(String(100), nullable=True)  # CDC-PLACES, ACS, etc.
    description = Column(Text, nullable=True)
    unit = Column(String(50), nullable=True)
    higher_is_better = Column(Integer, default=1)
    weight = Column(Float, default=1.0)
    threshold_alert = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    values = relationship("SDOHIndicator", back_populates="catalog_item")


class SDOHIndicator(Base):
    __tablename__ = "sdoh_indicators"
    __table_args__ = (
        UniqueConstraint("tract_id", "catalog_id", "year", name="uq_tract_catalog_year"),
    )

    id = Column(Integer, primary_key=True, index=True)
    tract_id = Column(ForeignKey("census_tracts.id"), nullable=False, index=True)
    catalog_id = Column(ForeignKey("indicator_catalog.id"), nullable=False, index=True)
    year = Column(Integer, nullable=False)
    value = Column(Float, nullable=False)
    low_ci = Column(Float, nullable=True)
    high_ci = Column(Float, nullable=True)
    sample_size = Column(Integer, nullable=True)

    census_tract = relationship("CensusTract", back_populates="indicators")
    catalog_item = relationship("IndicatorCatalog", back_populates="values")


class EquityIndex(Base):
    """Computed equity / inequality indexes per tract (Gini, disparity, etc.)."""

    __tablename__ = "equity_indexes"
    __table_args__ = (
        UniqueConstraint(
            "tract_id", "year", "index_type", name="uq_equity_tract_year_type"
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    tract_id = Column(ForeignKey("census_tracts.id"), nullable=False, index=True)
    year = Column(Integer, nullable=False)
    domain = Column(String(100), nullable=True)
    index_type = Column(String(100), nullable=False, index=True)
    value = Column(Float, nullable=False)
    percentile = Column(Float, nullable=True)  # 0-100 national percentile
    risk_level = Column(String(30), nullable=True)  # low/moderate/high/critical
    method = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class AlertRule(Base):
    __tablename__ = "alert_rules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    catalog_id = Column(ForeignKey("indicator_catalog.id"), nullable=True)
    domain = Column(String(100), nullable=True)
    comparison = Column(String(20), nullable=False)  # gt, lt, gte, lte
    threshold = Column(Float, nullable=False)
    severity = Column(String(30), default="high")  # info/low/medium/high/critical
    enabled = Column(String(5), default="true")
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    rule_id = Column(ForeignKey("alert_rules.id"), nullable=True)
    tract_id = Column(ForeignKey("census_tracts.id"), nullable=True)
    hospital_id = Column(ForeignKey("hospitals.id"), nullable=True)
    indicator_code = Column(String(100), nullable=True)
    indicator_name = Column(String(300), nullable=True)
    observed_value = Column(Float, nullable=True)
    severity = Column(String(30), nullable=True)
    status = Column(String(30), default="open")  # open/acknowledged/resolved
    message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
