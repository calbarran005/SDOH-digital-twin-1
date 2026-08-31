from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from app.core.database import Base


class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(300), nullable=False)
    report_type = Column(String(50), nullable=False)  # pdf/word/excel/csv
    format = Column(String(20), nullable=False)
    status = Column(String(30), default="pending")  # pending/generated/error
    filename = Column(String(300), nullable=True)
    file_path = Column(String(500), nullable=True)
    query_params = Column(Text, nullable=True)  # JSON
    created_by = Column(ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    error = Column(Text, nullable=True)
