"""Figuras del artículo: cada panel por separado, con y sin título, para descargar.

Los archivos los generan los scripts del artículo (PNG 500 dpi, SVG y PDF):

    docker compose exec streamlit python streamlit_app/article_results.py
    docker compose exec backend python revision/revision_analyses.py
"""
import json
import os

import streamlit as st

import ui

PDIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                    "article_outputs", "paneles")
# Orden de las figuras en el manuscrito (las demás se muestran como complementarias).
ARTICLE_ORDER = ["fig1_arquitectura", "fig2_eda", "fig3_cv_friedman", "fig4_confusion_roc",
                 "figR1_validacion_espacial", "figR2_incertidumbre_mrp", "figR3_importancia_agrupada",
                 "figR4_h2_red_real"]
MIME = {"png": "image/png", "svg": "image/svg+xml", "pdf": "application/pdf"}

st.title("🖼️ Figuras del artículo")
st.caption("Cada panel se descarga por separado en PNG a 500 dpi o en formato vectorial (SVG/PDF). "
           "Use la versión **sin título** para el manuscrito: el título va en el pie de figura.")

mpath = os.path.join(PDIR, "manifest.json")
if not os.path.exists(mpath):
    st.warning("Todavía no hay figuras exportadas. Genérelas con:\n\n"
               "```\ndocker compose exec streamlit python streamlit_app/article_results.py\n"
               "docker compose exec backend python revision/revision_analyses.py\n```")
    st.stop()

with open(mpath, encoding="utf-8") as fh:
    manifest = json.load(fh)

variant = st.radio("Versión", ["Sin título (para el artículo)", "Con título"], horizontal=True)
suffix = "_sin_titulo" if variant.startswith("Sin") else ""

stems = [s for s in ARTICLE_ORDER if s in manifest] + sorted(s for s in manifest if s not in ARTICLE_ORDER)


def read(path):
    with open(path, "rb") as fh:
        return fh.read()


for stem in stems:
    info = manifest[stem]
    with st.expander(info["title"], expanded=False):
        panels = info["panels"]
        for i, pnl in enumerate(panels):
            base = os.path.join(PDIR, pnl["file"] + suffix)
            if not os.path.exists(base + ".png"):
                st.info(f"Falta {pnl['file']}{suffix}.png; vuelva a ejecutar el script.")
                continue
            label = f"Panel ({pnl['panel']}) · {pnl['title']}" if pnl["panel"] else pnl["title"]
            st.markdown(f"**{label}**")
            st.image(base + ".png", width="stretch")
            ui.download_buttons({ext: read(f"{base}.{ext}") for ext in MIME if os.path.exists(f"{base}.{ext}")},
                                pnl["file"] + suffix, f"art_{pnl['file']}{suffix}")
            if i < len(panels) - 1:
                st.divider()
