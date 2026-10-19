"""Utilidades compartidas por las vistas Streamlit."""

from __future__ import annotations

import os
from typing import Optional

import pandas as pd
import streamlit as st

from engine import llm
from engine.report import SECTIONS, ReportItem
from engine.style import hi_quality, plt, to_png

REQUIRE_LOGIN = os.getenv("STREAMLIT_REQUIRE_LOGIN", "true").lower() in ("1", "true", "yes")

S_BUSINESS, S_DATA, S_PREP, S_MODEL, S_EVAL, S_DEPLOY = SECTIONS


def init_state() -> None:
    for k, v in {"report": {}, "ds": None, "prep": None, "train": None, "inf": {},
                 "chat_lc": [], "chat_lf": [], "user": None, "executive": None}.items():
        st.session_state.setdefault(k, v)


# --------------------------------------------------------------------------- #
# Autenticación con los usuarios de la plataforma
# --------------------------------------------------------------------------- #


def require_login() -> None:
    if not REQUIRE_LOGIN:
        st.session_state.user = st.session_state.user or {"id": None, "username": "local"}
        return
    if st.session_state.user:
        return
    from app.core.database import SessionLocal
    from app.core.security import verify_password
    from app.models.user import User

    st.title("SDOH Digital Twin · Motor CRISP-DM")
    st.caption("Inicie sesión con su usuario de la plataforma.")
    with st.form("login"):
        username = st.text_input("Usuario o correo")
        password = st.text_input("Contraseña", type="password")
        ok = st.form_submit_button("Entrar", type="primary")
    if ok:
        db = SessionLocal()
        try:
            u = db.query(User).filter((User.username == username) | (User.email == username)).first()
            if u and u.is_active and verify_password(password, u.hashed_password):
                st.session_state.user = {"id": u.id, "username": u.username}
                st.rerun()
            st.error("Credenciales no válidas o usuario inactivo.")
        finally:
            db.close()
    st.stop()


# --------------------------------------------------------------------------- #
# Guardas de flujo CRISP-DM
# --------------------------------------------------------------------------- #


def need(key: str, msg: str):
    val = st.session_state.get(key)
    if val is None:
        st.warning(msg)
        st.stop()
    return val


def reset_from(section: str) -> None:
    """Invalida los resultados de `section` y de las fases posteriores."""
    idx = SECTIONS.index(section)
    st.session_state.report = {
        k: it for k, it in st.session_state.report.items()
        if it.section not in SECTIONS or SECTIONS.index(it.section) < idx
    }
    if idx <= SECTIONS.index(S_PREP):
        st.session_state.prep = None
    if idx <= SECTIONS.index(S_MODEL):
        st.session_state.train = None
    if idx <= SECTIONS.index(S_EVAL):
        st.session_state.inf = {}
    st.session_state.executive = None


# --------------------------------------------------------------------------- #
# Render: gráfico/tabla + explicabilidad + interpretación (+ IA opcional)
# --------------------------------------------------------------------------- #


def slugify(text: str) -> str:
    keep = "".join(c.lower() if c.isalnum() else "-" for c in text)
    while "--" in keep:
        keep = keep.replace("--", "-")
    return keep.strip("-") or "figura"


def download_figure(item: ReportItem, key: str) -> None:
    """Botones para bajar la figura en máxima calidad (PNG 300 dpi + SVG/PDF vectorial)."""
    options = [
        ("⬇️ PNG · 300 dpi", item.png_hires, "png", "image/png"),
        ("⬇️ SVG · vectorial", item.svg, "svg", "image/svg+xml"),
        ("⬇️ PDF · vectorial", item.pdf, "pdf", "application/pdf"),
    ]
    options = [o for o in options if o[1]]
    if not options:
        return
    slug = slugify(item.title)
    cols = st.columns(len(options))
    for col, (label, data, ext, mime) in zip(cols, options):
        col.download_button(label, data, file_name=f"{slug}.{ext}", mime=mime,
                            key=f"dl_{ext}_{key}")


def render(
    key: str,
    section: str,
    title: str,
    how: str,
    interpretation: str,
    fig=None,
    table: Optional[pd.DataFrame] = None,
    order: int = 0,
    show_table: bool = True,
) -> ReportItem:
    prev: Optional[ReportItem] = st.session_state.report.get(key)
    png = hires = svg = pdf = None
    if fig is not None:
        png = to_png(fig)
        if prev is not None and prev.png == png and prev.png_hires is not None:
            hires, svg, pdf = prev.png_hires, prev.svg, prev.pdf
        else:
            q = hi_quality(fig)
            hires, svg, pdf = q["png"], q["svg"], q["pdf"]
        plt.close(fig)
    item = ReportItem(key=key, section=section, title=title, how=how, interpretation=interpretation,
                      png=png, png_hires=hires, svg=svg, pdf=pdf, table=table, order=order,
                      llm_text=prev.llm_text if prev and prev.interpretation == interpretation else None)
    st.session_state.report[key] = item

    st.markdown(f"#### {title}")
    if png:
        st.image(png, width="stretch")
        download_figure(item, key)
    if table is not None and show_table:
        st.dataframe(table, width="stretch", hide_index=True)
        st.download_button("⬇️ CSV · datos de la tabla", table.to_csv(index=False).encode("utf-8"),
                           file_name=f"{slugify(title)}.csv", mime="text/csv", key=f"dl_csv_{key}")
    c1, c2 = st.columns(2)
    c1.info(f"**📖 Cómo se lee (explicabilidad)**\n\n{how}")
    c2.success(f"**🔎 Interpretación**\n\n{interpretation}")
    if item.llm_text:
        st.markdown(f"**✨ Interpretación asistida por IA**\n\n{item.llm_text}")
    elif llm.available() and st.button("✨ Ampliar interpretación con IA (LangChain)", key=f"llm_{key}"):
        with st.spinner("Generando con LangChain…"):
            try:
                item.llm_text = llm.explain_item(item)
                st.rerun()
            except Exception as exc:  # el análisis no depende del LLM
                st.error(f"No se pudo generar: {exc}")
    st.divider()
    return item


def label(code: str) -> str:
    ds = st.session_state.get("ds")
    return ds.label(code) if ds else code
