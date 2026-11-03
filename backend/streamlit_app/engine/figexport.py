"""Exportación de figuras para publicación.

- ``strip_titles``: quita los títulos de los ejes (para descargar la figura sin título).
- ``export_panels``: guarda cada panel de una figura compuesta como imagen independiente
  (PNG 500 dpi, SVG y PDF), en versión con título y sin título, y registra el resultado en
  ``manifest.json`` para que la app Streamlit los ofrezca para descarga.
"""
from __future__ import annotations

import json
import os
import re
import string
from contextlib import contextmanager
from typing import Iterable, List, Optional

from matplotlib.transforms import Bbox

DPI = 500
FORMATS = ("png", "svg", "pdf")
_PREFIX = re.compile(r"^\(\w\)\s*")


@contextmanager
def strip_titles(fig):
    """Oculta temporalmente los títulos de todos los ejes y el suptitle de ``fig``."""
    saved = [(ax, ax.get_title(loc)) for ax in fig.axes for loc in ("left", "center", "right")]
    sup = fig._suptitle.get_text() if getattr(fig, "_suptitle", None) else None
    try:
        for ax in fig.axes:
            for loc in ("left", "center", "right"):
                ax.set_title("", loc=loc)
        if sup is not None:
            fig._suptitle.set_text("")
        yield fig
    finally:
        it = iter(saved)
        for ax in fig.axes:
            for loc in ("left", "center", "right"):
                _ax, text = next(it)
                ax.set_title(text, loc=loc)
        if sup is not None:
            fig._suptitle.set_text(sup)


def _groups(fig, main: List) -> List[List]:
    """Asocia los ejes secundarios (p. ej., barras de color) al panel principal más próximo."""
    groups = [[ax] for ax in main]
    for extra in fig.axes:
        if extra in main:
            continue
        cb = getattr(extra, "_colorbar", None)
        parent = getattr(getattr(cb, "mappable", None), "axes", None)
        if parent in main:
            groups[main.index(parent)].append(extra)
            continue
        ex = extra.get_position()
        cx = (ex.x0 + ex.x1) / 2

        def dist(ax):
            pos = ax.get_position()
            return 0 if pos.x0 <= cx <= pos.x1 else min(abs(cx - pos.x0), abs(cx - pos.x1))

        groups[min(range(len(main)), key=lambda i: dist(main[i]))].append(extra)
    return groups


def _save_bbox(fig, group, path_stem: str) -> None:
    renderer = fig.canvas.get_renderer()
    boxes = [a.get_tightbbox(renderer) for a in group if a.get_visible()]
    bb = Bbox.union([b for b in boxes if b is not None]).transformed(fig.dpi_scale_trans.inverted())
    bb = bb.padded(0.06)
    for fmt in FORMATS:
        fig.savefig(f"{path_stem}.{fmt}", dpi=DPI, bbox_inches=bb, format=fmt)


def export_panels(fig, axes: Optional[Iterable], stem: str, outdir: str, figure_title: str = "") -> list:
    """Guarda cada panel de ``fig`` por separado, con título y sin título.

    Los archivos quedan en ``outdir/paneles`` como ``<stem>_<letra>[_sin_titulo].<png|svg|pdf>``.
    Devuelve la lista de paneles exportados y actualiza ``outdir/paneles/manifest.json``.
    """
    pdir = os.path.join(outdir, "paneles")
    os.makedirs(pdir, exist_ok=True)
    main = list(axes) if axes is not None else [fig.axes[0]]
    groups = _groups(fig, main)
    fig.canvas.draw()
    panels = []
    for letter, group in zip(string.ascii_lowercase, groups):
        ax = group[0]
        others = [a for a in fig.axes if a not in group]
        vis = {a: a.get_visible() for a in others}
        old_title = ax.get_title()
        clean = _PREFIX.sub("", old_title)
        name = f"{stem}_{letter}" if len(groups) > 1 else stem
        try:
            for a in others:
                a.set_visible(False)
            ax.set_title(clean, color=ax.title.get_color())
            _save_bbox(fig, group, os.path.join(pdir, name))
            ax.set_title("")
            _save_bbox(fig, group, os.path.join(pdir, name + "_sin_titulo"))
        finally:
            ax.set_title(old_title)
            for a, v in vis.items():
                a.set_visible(v)
        panels.append({"panel": letter if len(groups) > 1 else "", "title": clean, "file": name})

    mpath = os.path.join(pdir, "manifest.json")
    manifest = {}
    if os.path.exists(mpath):
        with open(mpath, encoding="utf-8") as fh:
            manifest = json.load(fh)
    manifest[stem] = {"title": figure_title or stem, "panels": panels, "dpi": DPI}
    with open(mpath, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=1)
    return panels
