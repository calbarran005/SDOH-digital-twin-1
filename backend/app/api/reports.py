from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_permission
from app.core.database import get_db
from app.models.report import Report
from app.models.user import User
from app.schemas.report import ReportOut, ReportRequest
from app.services.audit_service import audit
from app.services.report_service import GENERATORS, REPORT_DIR, _fetch_data

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("", response_model=List[ReportOut])
def list_reports(
    limit: int = 100,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return (
        db.query(Report)
        .order_by(Report.id.desc())
        .limit(limit)
        .all()
    )


@router.post("/generate", response_model=ReportOut)
def generate_report(
    payload: ReportRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    report = Report(
        title=payload.title,
        report_type=payload.report_type,
        format=payload.format,
        status="pending",
        query_params=str(payload.model_dump()),
        created_by=user.id,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    generator = GENERATORS.get(payload.format.lower())
    if not generator:
        report.status = "error"
        report.error = f"Formato no soportado: {payload.format}"
        db.commit()
        raise HTTPException(status_code=400, detail=report.error)

    try:
        rows, by_domain, hospital, equity_rows, catchment = _fetch_data(
            db,
            payload.hospital_id,
            payload.catchment_id,
            payload.year or datetime.now().year,
            payload.domains,
        )
        if rows is None:
            report.status = "error"
            report.error = "Sin datos: defina hospital/catchment"
            db.commit()
            raise HTTPException(status_code=400, detail=report.error)

        filename, file_path = generator(
            db, rows, by_domain, hospital, catchment, payload.title, payload.year or datetime.now().year
        )
        report.status = "generated"
        report.filename = filename
        report.file_path = file_path
        db.commit()
        audit(db, user, "GENERATE", "report", report.id, f"{filename} ({payload.format})")
    except Exception as e:
        report.status = "error"
        report.error = str(e)
        db.commit()
        raise HTTPException(status_code=500, detail=str(e))

    db.refresh(report)
    return report


@router.get("/download/{report_id}")
def download_report(
    report_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    report = db.query(Report).get(report_id)
    if not report or report.status != "generated" or not report.file_path:
        raise HTTPException(status_code=404, detail="Reporte no disponible")
    return FileResponse(report.file_path, filename=report.filename)
