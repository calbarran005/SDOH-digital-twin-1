from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.core.database import Base


class County(Base):
    __tablename__ = "counties"

    id = Column(Integer, primary_key=True, index=True)
    geoid = Column(String(20), unique=True, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    state_fips = Column(String(2), nullable=True)
    county_fips = Column(String(3), nullable=True)
    state_name = Column(String(100), nullable=True)
    geom = Column(Geometry(geometry_type="MULTIPOLYGON", srid=4326), nullable=True)

    census_tracts = relationship(
        "CensusTract", back_populates="county", cascade="all, delete-orphan"
    )


class CensusTract(Base):
    __tablename__ = "census_tracts"

    id = Column(Integer, primary_key=True, index=True)
    geoid = Column(String(20), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=True)
    state_fips = Column(String(2), nullable=True)
    county_fips = Column(String(3), nullable=True)
    tract_fips = Column(String(11), nullable=True)
    county_id = Column(ForeignKey("counties.id"), nullable=True)
    total_population = Column(Integer, nullable=True)
    land_area = Column(Float, nullable=True)
    geom = Column(Geometry(geometry_type="MULTIPOLYGON", srid=4326), nullable=True)
    center = Column(Geometry(geometry_type="POINT", srid=4326), nullable=True)

    county = relationship("County", back_populates="census_tracts")
    indicators = relationship(
        "SDOHIndicator", back_populates="census_tract", cascade="all, delete-orphan"
    )
    catchment_memberships = relationship(
        "CatchmentMembership", back_populates="census_tract"
    )


class Hospital(Base):
    __tablename__ = "hospitals"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(300), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    cms_id = Column(String(20), nullable=True, index=True)
    address = Column(String(300), nullable=True)
    city = Column(String(100), nullable=True)
    state = Column(String(2), nullable=True)
    zip_code = Column(String(10), nullable=True)
    description = Column(Text, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    geom = Column(Geometry(geometry_type="POINT", srid=4326), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    catchments = relationship(
        "HospitalCatchment", back_populates="hospital", cascade="all, delete-orphan"
    )


class HospitalCatchment(Base):
    """Defines the geographic catchment (service area) of a hospital."""

    __tablename__ = "hospital_catchments"

    id = Column(Integer, primary_key=True, index=True)
    hospital_id = Column(ForeignKey("hospitals.id"), nullable=False)
    name = Column(String(200), nullable=False)
    catchment_type = Column(
        String(50), default="radius"
    )  # radius | polygon | commission-defined
    radius_km = Column(Float, nullable=True)
    description = Column(Text, nullable=True)
    geom = Column(Geometry(geometry_type="MULTIPOLYGON", srid=4326), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    hospital = relationship("Hospital", back_populates="catchments")
    memberships = relationship(
        "CatchmentMembership", back_populates="catchment", cascade="all, delete-orphan"
    )


class CatchmentMembership(Base):
    """Maps census tracts to a hospital catchment with population share."""

    __tablename__ = "catchment_memberships"

    id = Column(Integer, primary_key=True, index=True)
    catchment_id = Column(ForeignKey("hospital_catchments.id"), nullable=False)
    tract_id = Column(ForeignKey("census_tracts.id"), nullable=False)
    population_share = Column(Float, nullable=True, default=1.0)

    catchment = relationship("HospitalCatchment", back_populates="memberships")
    census_tract = relationship("CensusTract", back_populates="catchment_memberships")
