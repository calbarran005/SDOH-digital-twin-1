from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_permission
from app.core.database import get_db
from app.models.geo import (  # noqa: F401
    CensusTract,
    Hospital,
    HospitalCatchment,
)
from app.models.user import User
from app.schemas.geo import CatchmentIn, HospitalIn, HospitalOut
from app.services.audit_service import audit

router = APIRouter(prefix="/hospitals", tags=["Hospitals"])


@router.get("", response_model=List[HospitalOut])
def list_hospitals(
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(Hospital)
    if search:
        q = q.filter(Hospital.name.ilike(f"%{search}%"))
    return q.order_by(Hospital.name).all()


@router.post("", response_model=HospitalOut, status_code=status.HTTP_201_CREATED)
def create_hospital(
    payload: HospitalIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("hospitals:write")),
):
    slug = payload.slug or payload.name.lower().replace(" ", "-").replace("/", "-")
    hospital = Hospital(**payload.model_dump(exclude={"slug"}), slug=slug)
    if payload.latitude is not None and payload.longitude is not None:
        from sqlalchemy import text

        hospital.geom = text(
            f"ST_SetSRID(ST_MakePoint({payload.longitude},{payload.latitude}),4326)"
        )
    db.add(hospital)
    db.commit()
    db.refresh(hospital)
    audit(db, user, "CREATE", "hospital", hospital.id, hospital.name)
    return hospital


@router.get("/{hospital_id}", response_model=HospitalOut)
def get_hospital(
    hospital_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    hospital = db.query(Hospital).get(hospital_id)
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital no encontrado")
    return hospital


@router.post("/{hospital_id}/catchments", response_model=CatchmentIn)
def create_catchment(
    hospital_id: int,
    payload: CatchmentIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("hospitals:write")),
):
    hospital = db.query(Hospital).get(hospital_id)
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital no encontrado")
    catchment = HospitalCatchment(
        hospital_id=hospital_id,
        name=payload.name,
        catchment_type=payload.catchment_type,
        radius_km=payload.radius_km,
        description=payload.description,
    )
    db.add(catchment)
    db.commit()
    audit(db, user, "CREATE", "catchment", catchment.id, catchment.name)
    return catchment


@router.get("/{hospital_id}/catchments", response_model=List[CatchmentIn])
def hospital_catchments(
    hospital_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    return (
        db.query(HospitalCatchment)
        .filter(HospitalCatchment.hospital_id == hospital_id)
        .all()
    )
