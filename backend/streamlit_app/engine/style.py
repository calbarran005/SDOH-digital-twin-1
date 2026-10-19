"""Estilo común de las figuras matplotlib (las mismas van a pantalla y al PDF)."""

import io

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

INK = "#1e293b"
MUTED = "#64748b"
GRID = "#cbd5e1"
BLUE = "#2563eb"
AMBER = "#f59e0b"
GREEN = "#059669"
RED = "#dc2626"
GRAY = "#94a3b8"
PALETTE = ["#2563eb", "#f59e0b", "#059669", "#dc2626", "#7c3aed", "#0891b2", "#db2777"]
LEVEL_COLORS = {"low": "#10b981", "moderate": "#f59e0b", "high": "#f97316", "critical": "#ef4444"}
LEVEL_ES = {"low": "Bajo", "moderate": "Moderado", "high": "Alto", "critical": "Crítico"}

plt.rcParams.update(
    {
        "font.size": 9,
        "axes.titlesize": 10,
        "axes.labelsize": 9,
        "axes.edgecolor": GRID,
        "axes.labelcolor": INK,
        "xtick.color": MUTED,
        "ytick.color": MUTED,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.grid": True,
        "grid.color": GRID,
        "grid.linestyle": "--",
        "grid.alpha": 0.5,
        "figure.dpi": 110,
    }
)


def fig_bytes(fig, fmt: str = "png", dpi: int = 150) -> bytes:
    """Serializa una figura matplotlib en cualquier formato (png/svg/pdf)."""
    buf = io.BytesIO()
    fig.tight_layout()
    fig.savefig(buf, format=fmt, dpi=dpi, bbox_inches="tight")
    return buf.getvalue()


def to_png(fig, dpi: int = 150) -> bytes:
    """PNG para pantalla/reporte; use ``dpi=300`` para la descarga en alta calidad."""
    return fig_bytes(fig, "png", dpi=dpi)


def hi_quality(fig) -> dict:
    """Variantes de máxima calidad para descargar: PNG 300 dpi y vectores SVG/PDF."""
    out = {"png": None, "svg": None, "pdf": None}
    try:
        out["png"] = to_png(fig, dpi=300)
    except Exception:
        pass
    for fmt in ("svg", "pdf"):
        try:
            out[fmt] = fig_bytes(fig, fmt)
        except Exception:
            out[fmt] = None
    return out


def short(name: str, n: int = 32) -> str:
    return name if len(name) <= n else name[: n - 1] + "…"
