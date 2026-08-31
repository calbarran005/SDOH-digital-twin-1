import csv
import io
import json
import os
from datetime import datetime

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from sqlalchemy.orm import Session

from app.models.geo import CensusTract, Hospital, HospitalCatchment
from app.models.sdoh import EquityIndex, IndicatorCatalog, SDOHIndicator

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from docx import Document
from docx.shared import Inches, Pt
from openpyxl import Workbook

REPORT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "generated_reports")
REPORT_DIR = os.path.abspath(REPORT_DIR)
CHART_DIR = os.path.join(REPORT_DIR, "charts")
os.makedirs(REPORT_DIR, exist_ok=True)
os.makedirs(CHART_DIR, exist_ok=True)


def _fetch_data(
    db: Session, hospital_id: int, catchment_id: int, year: int, domains: list
):
    hospital = db.query(Hospital).get(hospital_id) if hospital_id else None
    catchment = (
        db.query(HospitalCatchment).get(catchment_id) if catchment_id else None
    )
    if not catchment and hospital:
        catchment = hospital.catchments[0] if hospital.catchments else None
    if not catchment:
        return None, None, hospital

    tract_ids = [m.tract_id for m in catchment.memberships]
    catalog_q = db.query(IndicatorCatalog)
    if domains:
        catalog_q = catalog_q.filter(IndicatorCatalog.domain.in_(domains))
    catalog = catalog_q.all()
    code_to_item = {c.code: c for c in catalog}

    vals = (
        db.query(SDOHIndicator)
        .filter(
            SDOHIndicator.tract_id.in_(tract_ids),
            SDOHIndicator.year == year,
            SDOHIndicator.catalog_id.in_([c.id for c in catalog]),
        )
        .all()
    )

    rows = []
    by_domain = {}
    for v in vals:
        item = v.catalog_item
        tract = db.query(CensusTract).get(v.tract_id)
        rows.append(
            {
                "tract_geoid": tract.geoid if tract else None,
                "population": tract.total_population if tract else None,
                "indicator": item.code if item else None,
                "domain": item.domain if item else None,
                "value": v.value,
            }
        )
        dom = item.domain if item else "other"
        by_domain.setdefault(dom, []).append(v.value)

    equity_rows = (
        db.query(EquityIndex)
        .filter(EquityIndex.tract_id.in_(tract_ids), EquityIndex.year == year)
        .all()
    )
    return rows, by_domain, hospital, equity_rows, catchment


def _make_bar_chart(by_domain: dict, title: str) -> str:
    path = os.path.join(CHART_DIR, f"chart_{datetime.now().timestamp() * 1000:.0f}.png")
    domains = list(by_domain.keys())
    import statistics

    means = [
        statistics.mean(v) if v else 0 for v in (by_domain.get(d, []) for d in domains)
    ]
    plt.figure(figsize=(8, 4))
    plt.bar(domains, means, color="#2c7fb8")
    plt.title(title)
    plt.ylabel("Valor promedio")
    plt.xticks(rotation=30, ha="right")
    plt.tight_layout()
    plt.savefig(path, dpi=100)
    plt.close()
    return path


# ---------------------------------------------------------------- PDF
def generate_pdf(db: Session, rows, by_domain, hospital, catchment, title, year):
    filename = f"SDOH_Report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    path = os.path.join(REPORT_DIR, filename)

    doc = SimpleDocTemplate(path, pagesize=landscape(A4))
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "TitleX", parent=styles["Title"], fontSize=22, spaceAfter=12
    )
    story = []
    story.append(Paragraph(title, title_style))
    story.append(Paragraph(
        f"Hospital: {hospital.name if hospital else 'N/A'} &nbsp;&nbsp; Año: {year}",
        styles["Normal"],
    ))
    story.append(Spacer(1, 0.3 * inch))

    if by_domain:
        chart_path = _make_bar_chart(by_domain, "Promedio de indicadores por dominio (SDOH)")
        story.append(Image(chart_path, width=7 * inch, height=3.5 * inch))
        story.append(Spacer(1, 0.3 * inch))

    table_data = [["Dominio", "Indicadores", "Promedio"]]
    for dom, values in (by_domain or {}).items():
        avg = sum(values) / len(values) if values else 0
        table_data.append([str(dom), str(len(values)), f"{avg:.3f}"])
    tbl = Table(table_data)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
    ]))
    story.append(tbl)
    doc.build(story)
    return filename, path


# ---------------------------------------------------------------- Word
def generate_word(db: Session, rows, by_domain, hospital, catchment, title, year):
    filename = f"SDOH_Report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.docx"
    path = os.path.join(REPORT_DIR, filename)
    doc = Document()
    doc.add_heading(title, level=0)
    doc.add_paragraph(
        f"Hospital: {hospital.name if hospital else 'N/A'}\n"
        f"Área de captación: {catchment.name if catchment else 'N/A'}\n"
        f"Año: {year}\n"
    )
    if by_domain:
        doc.add_heading("Resumen por dominio", level=1)
        table = doc.add_table(rows=1, cols=3)
        hdr = table.rows[0].cells
        hdr[0].text = "Dominio"
        hdr[1].text = "Indicadores"
        hdr[2].text = "Promedio"
        for dom, values in by_domain.items():
            cells = table.add_row().cells
            cells[0].text = str(dom)
            cells[1].text = str(len(values))
            cells[2].text = f"{(sum(values) / len(values)) if values else 0:.3f}"
        chart_path = _make_bar_chart(by_domain, "Promedio por dominio")
        doc.add_picture(chart_path, width=Inches(6))
    doc.save(path)
    return filename, path


# ---------------------------------------------------------------- Excel
def generate_excel(db: Session, rows, by_domain, hospital, catchment, title, year):
    filename = f"SDOH_Report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    path = os.path.join(REPORT_DIR, filename)
    wb = Workbook()
    ws = wb.active
    ws.title = "Resumen"
    ws.append(["Dominio", "Indicadores", "Promedio"])
    for dom, values in (by_domain or {}).items():
        avg = sum(values) / len(values) if values else 0
        ws.append([dom, len(values), round(avg, 4)])
    ws2 = wb.create_sheet("Detalle")
    ws2.append(["Tract GEOID", "Población", "Indicador", "Dominio", "Valor"])
    for r in (rows or []):
        ws2.append(
            [r["tract_geoid"], r["population"], r["indicator"], r["domain"], r["value"]]
        )
    wb.save(path)
    return filename, path


# ---------------------------------------------------------------- CSV
def generate_csv(db: Session, rows, by_domain, hospital, catchment, title, year):
    filename = f"SDOH_Report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    path = os.path.join(REPORT_DIR, filename)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Tract GEOID", "Población", "Indicador", "Dominio", "Valor"])
        for r in (rows or []):
            writer.writerow(
                [r["tract_geoid"], r["population"], r["indicator"], r["domain"], r["value"]]
            )
    return filename, path


GENERATORS = {
    "pdf": generate_pdf,
    "word": generate_word,
    "excel": generate_excel,
    "csv": generate_csv,
}
