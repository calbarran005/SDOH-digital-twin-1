from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ReportRequest(BaseModel):
    title: str
    report_type: str = "catchment_equity"
    format: str = "pdf"  # pdf | word | excel | csv
    hospital_id: Optional[int] = None
    catchment_id: Optional[int] = None
    year: Optional[int] = None
    domains: Optional[list] = None
    include_charts: bool = True


class ReportOut(BaseModel):
    id: int
    title: str
    report_type: str
    format: str
    status: str
    filename: Optional[str] = None
    created_at: Optional[datetime] = None
    error: Optional[str] = None

    class Config:
        from_attributes = True
