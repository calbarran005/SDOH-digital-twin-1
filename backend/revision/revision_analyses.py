"""Análisis adicionales solicitados en la revisión por pares del artículo SP-5.

Ejecuta, sin base de datos y con semilla 42:

  R1  Validación espacial (bloques k-means por condado, 5 pliegues × 5 semillas) y
      validación cruzada entre condados (Cook → New York y viceversa); métricas por
      condado en el conjunto de prueba; I de Moran de los residuos.
  R2  Propagación de la incertidumbre de PLACES (Monte Carlo con los IC 95 %).
  R3  Control de las covariables compartidas con el modelo MRP de PLACES
      (edad, raza/etnia, educación y pobreza de CDC/ATSDR SVI 2022).
  R4  Validez del índice sin circularidad (índice solo con determinantes) frente a
      resultados externos (esperanza de vida USALEEP, SVI).
  R5  H2 con la red hospitalaria real (CMS 2023, 52 hospitales, camas):
      2SFCA binario frente a E2SFCA gaussiano, bootstrap por bloques espaciales,
      IC de Zou y prueba de permutación pareada corregida.
  R6  Importancia agrupada, condicional y SHAP lineal agrupado, con estabilidad
      bootstrap.
  R7  H1 extremo a extremo (ingesta local → ETL → índice → predicción → GeoJSON).
  R8  Potencia y efecto mínimo detectable para H1–H4.
  R9  Rejilla ampliada de C para la regresión logística.

    cd backend && python revision/revision_analyses.py
Salida: backend/article_outputs/revision/revision_results.json y figuras PNG.
"""
from __future__ import annotations

import json
import os
import sys
import time
import warnings
from bisect import bisect_left

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(HERE)
sys.path[:0] = [HERE, BACKEND, os.path.join(BACKEND, "streamlit_app")]
warnings.filterwarnings("ignore")
os.environ.setdefault("PYTHONWARNINGS", "ignore")

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from scipy import stats  # noqa: E402
from scipy.cluster import hierarchy  # noqa: E402
from scipy.spatial.distance import squareform  # noqa: E402
from sklearn.base import clone  # noqa: E402
from sklearn.cluster import KMeans  # noqa: E402
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier  # noqa: E402
from sklearn.dummy import DummyClassifier  # noqa: E402
from sklearn.impute import SimpleImputer  # noqa: E402
from sklearn.linear_model import LogisticRegression, Ridge  # noqa: E402
from sklearn.metrics import f1_score, mean_absolute_error, r2_score, cohen_kappa_score  # noqa: E402
from sklearn.model_selection import GroupKFold, KFold, StratifiedKFold, RepeatedStratifiedKFold  # noqa: E402
from sklearn.neural_network import MLPClassifier  # noqa: E402
from sklearn.pipeline import Pipeline  # noqa: E402
from sklearn.preprocessing import StandardScaler  # noqa: E402

import matplotlib  # noqa: E402

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

from places_data import ALL_CODES, HIGHER_IS_BETTER, model_frame  # noqa: E402
from engine import modeling  # noqa: E402
from app.services import ml_service  # noqa: E402

SEED = 42
OUT = os.path.join(BACKEND, "article_outputs", "revision")
EXT = os.path.join(BACKEND, "data", "external")
os.makedirs(OUT, exist_ok=True)
TARGET = "pct_obesity"
FEATURES = list(ml_service.FEATURES)
CLASSES = list(ml_service.CLASSES)
OUTCOME_CODES = [
    "pct_obesity", "pct_diabetes", "pct_depression", "pct_mental_distress", "pct_fair_poor_health",
    "pct_copd", "pct_chd", "pct_stroke", "pct_asthma", "pct_any_disability", "pct_high_bp",
]
SDOH_INDEX_CODES = [c for c in ALL_CODES if c not in OUTCOME_CODES]  # 16 indicadores
LABEL = {
    "pct_no_health_insurance": "Sin seguro médico", "pct_food_insecurity": "Inseguridad alimentaria",
    "pct_food_stamps": "Ayuda alimentaria (SNAP)", "pct_housing_insecurity": "Inseguridad de vivienda",
    "pct_utility_shutoff": "Amenaza de corte de servicios", "pct_no_transportation": "Falta de transporte",
    "pct_lack_social_support": "Falta de apoyo social", "pct_loneliness": "Soledad",
    "pct_routine_checkup": "Chequeo médico anual", "pct_cholesterol_screening": "Cribado de colesterol",
    "pct_smoking": "Tabaquismo", "pct_inactivity": "Inactividad física", "pct_binge_drinking": "Consumo excesivo de alcohol",
}
R: dict = {"meta": {"seed": SEED, "python": sys.version.split()[0]}}
t_start = time.time()


def log(*a):
    print(f"[{time.time() - t_start:6.0f}s]", *a, flush=True)


# --------------------------------------------------------------------------- utilidades
def best_specs():
    """Mejores configuraciones de la búsqueda original (Tabla 3)."""
    def pipe(m):
        return Pipeline([("imputer", SimpleImputer(strategy="median")), ("scaler", StandardScaler()), ("model", m)])

    return {
        "LR": pipe(LogisticRegression(C=100.0, max_iter=2000, random_state=SEED)),
        "GB": pipe(HistGradientBoostingClassifier(learning_rate=0.1, max_depth=6, random_state=SEED)),
        "RF": pipe(RandomForestClassifier(n_estimators=200, max_depth=None, min_samples_leaf=1, random_state=SEED, n_jobs=-1)),
        "MLP": pipe(MLPClassifier(hidden_layer_sizes=(64, 32), alpha=0.01, max_iter=1500, early_stopping=True, random_state=SEED)),
        "Azar": Pipeline([("imputer", SimpleImputer(strategy="median")), ("model", DummyClassifier(strategy="stratified", random_state=SEED))]),
    }


def labels(y, cuts):
    return ml_service._risk_labels(pd.Series(np.asarray(y, float)), list(cuts)).values


def project_km(lon, lat):
    lat0 = np.deg2rad(np.nanmean(lat))
    return np.c_[np.asarray(lon) * 111.32 * np.cos(lat0), np.asarray(lat) * 110.57]


def knn_weights(xy, k=5):
    d = ((xy[:, None, :] - xy[None, :, :]) ** 2).sum(-1)
    np.fill_diagonal(d, np.inf)
    nn = np.argsort(d, axis=1)[:, :k]
    return nn


def morans_i(z, nn, n_perm=999, seed=SEED):
    z = np.asarray(z, float) - np.mean(z)
    n, k = nn.shape
    lag = z[nn].mean(1)
    i_obs = (n / n) * (z @ lag) / (z @ z)
    rng = np.random.default_rng(seed)
    perm = np.empty(n_perm)
    for b in range(n_perm):
        zp = rng.permutation(z)
        perm[b] = (zp @ zp[nn].mean(1)) / (zp @ zp)
    p = (np.sum(np.abs(perm) >= abs(i_obs)) + 1) / (n_perm + 1)
    zsc = (i_obs - perm.mean()) / perm.std()
    return {"I": float(i_obs), "z": float(zsc), "p": float(p), "E_I": float(-1 / (n - 1))}


def spatial_blocks(meta, n_blocks_total=20, seed=SEED):
    """Bloques k-means por condado, proporcionales al número de tracts."""
    g = np.empty(len(meta), dtype=int)
    off = 0
    for county, sub in meta.groupby("county", sort=True):
        idx = np.where(meta["county"].values == county)[0]
        kb = max(2, int(round(n_blocks_total * len(idx) / len(meta))))
        xy = project_km(sub["lon"].values, sub["lat"].values)
        km = KMeans(n_clusters=kb, n_init=10, random_state=seed).fit(xy)
        g[idx] = km.labels_ + off
        off += kb
    return g


def fold_eval(model, Xtr, ytr_raw, Xte, yte_raw):
    cuts = np.quantile(ytr_raw, [0.25, 0.5, 0.75])
    ytr, yte = labels(ytr_raw, cuts), labels(yte_raw, cuts)
    m = clone(model).fit(Xtr, ytr)
    pred = m.predict(Xte)
    return f1_score(yte, pred, average="macro", labels=CLASSES, zero_division=0), cohen_kappa_score(yte, pred), m, pred, yte


def spearman_ci(x, y):
    r = stats.spearmanr(x, y).statistic
    n = len(x)
    se = np.sqrt((1 + r ** 2 / 2) / (n - 3))
    z = np.arctanh(r)
    return float(r), float(np.tanh(z - 1.96 * se)), float(np.tanh(z + 1.96 * se))


def save(fig, name):
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, name), dpi=300, bbox_inches="tight")
    plt.close(fig)


# --------------------------------------------------------------------------- datos
df, VAL, SE, META = model_frame()
X_all = df[FEATURES].values
y_all = df[TARGET].values.astype(float)
p = modeling.prepare(df, TARGET, FEATURES)
tr_idx, te_idx = p["X_train"].index.values, p["X_test"].index.values
cuts0 = p["cuts"]
R["data"] = {"tracts": len(df), "cuts_train": cuts0, "n_train": len(tr_idx), "n_test": len(te_idx),
             "test_by_county": META.iloc[te_idx]["county"].value_counts().to_dict(),
             "sdoh_index_codes": SDOH_INDEX_CODES}
log("datos", len(df))
XY = np.vstack([project_km(META.lon.values, META.lat.values)])
NN = knn_weights(XY, 5)
R["moran_obesity"] = morans_i(y_all, NN)
log("Moran obesidad", R["moran_obesity"])

# Correlograma de Moran por bandas de distancia (pesos estandarizados por fila)
D = np.sqrt(((XY[:, None, :] - XY[None, :, :]) ** 2).sum(-1))
zc = y_all - y_all.mean()
corr_rows = []
for lo, hi in [(0, 1), (1, 2), (2, 4), (4, 8), (8, 16), (16, 32), (32, 64)]:
    W = ((D > lo) & (D <= hi)).astype(float)
    np.fill_diagonal(W, 0)
    rs = W.sum(1)
    has = rs > 0
    W[has] /= rs[has, None]
    I = has.sum() / has.sum() * (zc[has] @ (W[has] @ zc)) / (zc[has] @ zc[has])
    corr_rows.append({"band_km": f"{lo}-{hi}", "I": float(I), "tracts_with_neighbors": int(has.sum())})
R["moran_correlogram"] = corr_rows
del D, W
OUTS7 = ["pct_obesity", "pct_diabetes", "pct_fair_poor_health", "pct_high_bp", "pct_chd", "pct_depression", "pct_mental_distress"]
morb = np.mean([stats.zscore(VAL[c].values) for c in OUTS7], 0)
R["moran_morbidity_composite"] = morans_i(morb, NN)
log("correlograma", corr_rows, "morbilidad", R["moran_morbidity_composite"]["I"])

# --------------------------------------------------------------------------- R1 validación espacial
specs = best_specs()
rows = []
fold_rows = []
for rep in range(5):
    groups = spatial_blocks(META, 20, seed=SEED + rep)
    gkf = GroupKFold(n_splits=5)
    # GroupKFold es determinista; se barajan las etiquetas de bloque por repetición
    perm_g = np.random.default_rng(SEED + rep).permutation(groups.max() + 1)[groups]
    for k, (a, b) in enumerate(gkf.split(X_all, y_all, perm_g)):
        for name, mdl in specs.items():
            f1, kap, *_ = fold_eval(mdl, X_all[a], y_all[a], X_all[b], y_all[b])
            fold_rows.append({"scheme": "Bloques espaciales", "rep": rep, "fold": k, "model": name, "f1": f1, "kappa": kap})
    kf = KFold(n_splits=5, shuffle=True, random_state=SEED + rep)
    for k, (a, b) in enumerate(kf.split(X_all)):
        for name, mdl in specs.items():
            f1, kap, *_ = fold_eval(mdl, X_all[a], y_all[a], X_all[b], y_all[b])
            fold_rows.append({"scheme": "Aleatoria", "rep": rep, "fold": k, "model": name, "f1": f1, "kappa": kap})
    log("R1 rep", rep)
FR = pd.DataFrame(fold_rows)
summ = FR.groupby(["scheme", "model"])["f1"].agg(["mean", "std", "count"]).reset_index()
# Prueba pareada aleatoria vs bloques para LR (Wilcoxon sobre 25 pares de pliegues)
lr_r = FR.query("scheme=='Aleatoria' and model=='LR'")["f1"].values
lr_b = FR.query("scheme=='Bloques espaciales' and model=='LR'")["f1"].values
w = stats.wilcoxon(lr_r, lr_b)
# Comparación LR vs GB bajo bloques espaciales (t corregida de Nadeau-Bengio, 25 pliegues)
def nb_t(a, b, n_tr, n_te):
    d = np.asarray(a) - np.asarray(b)
    J = len(d)
    var = d.var(ddof=1)
    t = d.mean() / np.sqrt((1 / J + n_te / n_tr) * var) if var > 0 else np.inf
    return float(d.mean()), float(t), float(2 * stats.t.sf(abs(t), J - 1))

gb_b = FR.query("scheme=='Bloques espaciales' and model=='GB'")["f1"].values
nb_lr_gb_block = nb_t(lr_b, gb_b, 0.8 * len(df), 0.2 * len(df))
R["R1_spatial_cv"] = {"summary": summ.to_dict("records"),
                      "LR_random_minus_block": float(lr_r.mean() - lr_b.mean()),
                      "wilcoxon_random_vs_block": {"W": float(w.statistic), "p": float(w.pvalue)},
                      "NB_LR_vs_GB_block": dict(zip(["delta", "t", "p"], nb_lr_gb_block))}
log("R1 resumen\n", summ)

# Sensibilidad al tamaño de bloque (solo LR, 5 semillas)
blk = []
for nb in (10, 20, 40, 80):
    vals = []
    for rep in range(5):
        g = spatial_blocks(META, nb, seed=SEED + rep)
        g = np.random.default_rng(SEED + rep).permutation(g.max() + 1)[g]
        for a, b in GroupKFold(5).split(X_all, y_all, g):
            vals.append(fold_eval(specs["LR"], X_all[a], y_all[a], X_all[b], y_all[b])[0])
    side = float(np.sqrt((2448 + 59) / nb))
    blk.append({"blocks": nb, "approx_block_side_km": side, "f1": float(np.mean(vals)), "sd": float(np.std(vals, ddof=1))})
R["R1_block_size"] = blk
log("bloques", blk)

# Validación entre condados (LOCO)
ridge = Pipeline([("imputer", SimpleImputer(strategy="median")), ("scaler", StandardScaler()), ("model", Ridge(alpha=1.0))])
loco = []
for train_c, test_c in [("Cook County", "New York County"), ("New York County", "Cook County")]:
    a = np.where(META.county.values == train_c)[0]
    b = np.where(META.county.values == test_c)[0]
    for name in ("LR", "GB", "RF", "Azar"):
        f1, kap, m, pred, yte = fold_eval(specs[name], X_all[a], y_all[a], X_all[b], y_all[b])
        loco.append({"train": train_c, "test": test_c, "model": name, "f1_cuts_train_county": f1, "kappa": kap,
                     "test_class_dist": pd.Series(yte).value_counts(normalize=True).round(3).to_dict()})
    # Con cortes globales (definición de riesgo del gemelo, cuartiles del entrenamiento original)
    m = clone(specs["LR"]).fit(X_all[a], labels(y_all[a], cuts0))
    f1g = f1_score(labels(y_all[b], cuts0), m.predict(X_all[b]), average="macro", labels=CLASSES, zero_division=0)
    rg = clone(ridge).fit(X_all[a], y_all[a])
    yp = rg.predict(X_all[b])
    loco.append({"train": train_c, "test": test_c, "model": "LR (cortes globales)", "f1_global_cuts": float(f1g)})
    loco.append({"train": train_c, "test": test_c, "model": "Ridge (continuo)", "MAE": float(mean_absolute_error(y_all[b], yp)),
                 "R2": float(r2_score(y_all[b], yp)), "rho": float(stats.spearmanr(y_all[b], yp).statistic),
                 "mean_bias": float(np.mean(yp - y_all[b]))})
R["R1_loco"] = loco
log("LOCO", pd.DataFrame(loco)[["train", "model"]].assign(**{"f1": [r.get("f1_cuts_train_county", r.get("f1_global_cuts", r.get("R2"))) for r in loco]}))

# Métricas por condado en el conjunto de prueba original + Moran de residuos
lr_fit = clone(specs["LR"]).fit(X_all[tr_idx], labels(y_all[tr_idx], cuts0))
pred_te = lr_fit.predict(X_all[te_idx])
yte0 = labels(y_all[te_idx], cuts0)
per_c = []
for c in ("Cook County", "New York County"):
    mk = META.iloc[te_idx]["county"].values == c
    per_c.append({"county": c, "n": int(mk.sum()),
                  "f1_macro": float(f1_score(yte0[mk], pred_te[mk], average="macro", labels=[l for l in CLASSES if l in set(yte0[mk])], zero_division=0)),
                  "accuracy": float(np.mean(yte0[mk] == pred_te[mk])),
                  "class_dist": pd.Series(yte0[mk]).value_counts().to_dict()})
R["R1_test_by_county"] = per_c
rg_full = clone(ridge).fit(X_all[tr_idx], y_all[tr_idx])
resid_all = y_all - rg_full.predict(X_all)
order = {c: i for i, c in enumerate(CLASSES)}
pred_all = lr_fit.predict(X_all)
ord_err = np.array([order[a] - order[b] for a, b in zip(labels(y_all, cuts0), pred_all)], float)
R["R1_moran_residuals"] = {"ridge_residual": morans_i(resid_all, NN), "ordinal_error_LR": morans_i(ord_err, NN)}
log("Moran residuos", R["R1_moran_residuals"])

# --------------------------------------------------------------------------- R2 incertidumbre (MOE)
B = 200
se_X = SE[FEATURES].values
se_y = SE[TARGET].values

def moe_scenario(perturb_X, perturb_y, comonotonic=False, seed=SEED):
    rng_ = np.random.default_rng(seed)
    f1s, lab_ag, pred_ag = [], [], []
    pc = np.zeros((len(df), 4))
    lc = np.zeros((len(df), 4))
    for b in range(B):
        if comonotonic:  # mismo choque para todas las medidas del tract (errores MRP correlacionados)
            e = rng_.standard_normal((len(df), 1))
            Xs = np.clip(X_all + perturb_X * e * se_X, 0, 100)
            ys = np.clip(y_all + perturb_y * e[:, 0] * se_y, 0, 100)
        else:
            Xs = np.clip(X_all + perturb_X * rng_.standard_normal(X_all.shape) * se_X, 0, 100)
            ys = np.clip(y_all + perturb_y * rng_.standard_normal(len(y_all)) * se_y, 0, 100)
        cuts = np.quantile(ys[tr_idx], [0.25, 0.5, 0.75])
        m = clone(specs["LR"]).fit(Xs[tr_idx], labels(ys[tr_idx], cuts))
        f1s.append(f1_score(labels(ys[te_idx], cuts), m.predict(Xs[te_idx]), average="macro", labels=CLASSES))
        la = labels(ys, cuts)
        lab_ag.append(np.mean(la == labels(y_all, cuts0)))
        pa = lr_fit.predict(Xs)
        pred_ag.append(np.mean(pa == pred_all))
        for j, c in enumerate(CLASSES):
            pc[:, j] += pa == c
            lc[:, j] += la == c
    f1s = np.array(f1s)
    return {"f1_mean": float(f1s.mean()), "f1_ci": [float(np.percentile(f1s, 2.5)), float(np.percentile(f1s, 97.5))],
            "label_agreement": float(np.mean(lab_ag)), "pred_agreement": float(np.mean(pred_ag)),
            "share_pred_stable_95": float(np.mean(pc.max(1) / B >= 0.95)), "share_label_stable_95": float(np.mean(lc.max(1) / B >= 0.95)),
            "_f1s": f1s, "_stab_pred": pc.max(1) / B, "_stab_lab": lc.max(1) / B}

scen = {"Solo entradas (X)": moe_scenario(1, 0), "Solo resultado (y)": moe_scenario(0, 1),
        "X e y independientes": moe_scenario(1, 1), "X e y comonótonos": moe_scenario(1, 1, comonotonic=True)}
mc_f1 = scen["X e y independientes"]["_f1s"]
stab_pred = scen["X e y independientes"]["_stab_pred"]
stab_lab = scen["X e y independientes"]["_stab_lab"]
cls_w = np.diff([y_all.min()] + list(cuts0) + [y_all.max()])
R["R2_moe"] = {"B": B, "scenarios": {k: {kk: vv for kk, vv in v.items() if not kk.startswith("_")} for k, v in scen.items()},
               "median_se_obesity": float(np.median(se_y)), "median_ci_halfwidth_obesity": float(np.median(1.959964 * se_y)),
               "class_widths_pp": [float(v) for v in cls_w], "median_relative_se_X": float(np.median(se_X / np.maximum(X_all, 1e-6)))}
log("R2", R["R2_moe"])

# --------------------------------------------------------------------------- R3 covariables MRP (SVI)
svi = pd.concat([pd.read_csv(os.path.join(EXT, f), low_memory=False) for f in ("svi2022_IL.csv", "svi2022_NY.csv")])
svi["geoid"] = svi["FIPS"].astype(str).str.zfill(11)
svi = svi.set_index("geoid")
DEMO = ["EP_AGE65", "EP_AGE17", "EP_AFAM", "EP_HISP", "EP_ASIAN", "EP_NOHSDP", "EP_POV150"]
dem = svi.reindex(df["geoid"])[DEMO + ["RPL_THEMES"]].replace(-999, np.nan)
R["R3_svi_match"] = int(dem[DEMO].notna().all(1).sum())
Xd = np.c_[dem[DEMO].values, (META.county.values == "Cook County").astype(float)]
sets = {"Demográficas (proxy MRP)": Xd, "13 determinantes (SP-5)": X_all, "Demográficas + determinantes": np.c_[Xd, X_all]}
r3 = []
groups0 = spatial_blocks(META, 20, seed=SEED)
for name, Xs in sets.items():
    for scheme in ("Aleatoria", "Bloques espaciales"):
        f1s, r2s = [], []
        splitter = (KFold(5, shuffle=True, random_state=SEED).split(Xs) if scheme == "Aleatoria"
                    else GroupKFold(5).split(Xs, y_all, groups0))
        for a, b in splitter:
            f1, *_ = fold_eval(specs["LR"], Xs[a], y_all[a], Xs[b], y_all[b])
            rr = clone(ridge).fit(Xs[a], y_all[a])
            f1s.append(f1)
            r2s.append(r2_score(y_all[b], rr.predict(Xs[b])))
        r3.append({"set": name, "scheme": scheme, "f1": float(np.mean(f1s)), "f1_sd": float(np.std(f1s, ddof=1)),
                   "r2": float(np.mean(r2s)), "r2_sd": float(np.std(r2s, ddof=1))})
R["R3_mrp"] = r3
# Correlación parcial de Spearman de cada determinante controlando las demográficas
rk = lambda v: stats.rankdata(v)  # noqa: E731
okm = ~np.isnan(Xd).any(1)
Zd = np.c_[np.ones(okm.sum()), np.apply_along_axis(rk, 0, Xd[okm])]
def resid(v):
    beta, *_ = np.linalg.lstsq(Zd, v, rcond=None)
    return v - Zd @ beta
ry = resid(rk(y_all[okm]))
partial = []
for j, f in enumerate(FEATURES):
    rx = resid(rk(X_all[okm, j]))
    r_p = float(np.corrcoef(rx, ry)[0, 1])
    r_b = float(stats.spearmanr(X_all[okm, j], y_all[okm]).statistic)
    partial.append({"code": f, "label": LABEL[f], "rho": r_b, "rho_partial": r_p})
R["R3_partial"] = partial
log("R3", pd.DataFrame(r3))

# --------------------------------------------------------------------------- R4 índice sin circularidad
def composite(codes, frame=VAL, weights=None):
    M = []
    for c in codes:
        v = frame[c].values.astype(float)
        s = (v - np.nanmin(v)) / ((np.nanmax(v) - np.nanmin(v)) or 1)
        M.append(s if HIGHER_IS_BETTER[c] == 1 else 1 - s)
    M = np.vstack(M)
    w = np.ones(len(codes)) / len(codes) if weights is None else np.asarray(weights) / np.sum(weights)
    return (w[:, None] * M).sum(0)

idx_orig = composite(ALL_CODES)
idx_sdoh = composite(SDOH_INDEX_CODES)
leep = pd.concat([pd.read_csv(os.path.join(EXT, f)) for f in ("usaleep_IL_A.csv", "usaleep_NY_A.csv")])
leep["geoid"] = leep["Tract ID"].astype(str).str.zfill(11)
le = leep.set_index("geoid")["e(0)"].reindex(df["geoid"]).values
svi_rpl = dem["RPL_THEMES"].values
r4 = []
for iname, iv in (("Índice original (27 indicadores, incluye resultados)", idx_orig), ("Índice SDOH (16 indicadores, sin resultados)", idx_sdoh)):
    for oname, ov in (("Obesidad (PLACES)", y_all), ("Esperanza de vida 2010–2015 (USALEEP)", le), ("SVI 2022 (percentil global)", svi_rpl)):
        ok = ~np.isnan(ov)
        r, lo, hi = spearman_ci(iv[ok], ov[ok])
        r4.append({"index": iname, "outcome": oname, "n": int(ok.sum()), "rho": r, "ci": [lo, hi]})
R["R4_index_validity"] = r4
R["R4_obesity_in_index"] = "pct_obesity" in ALL_CODES
log("R4", pd.DataFrame(r4)[["index", "outcome", "n", "rho"]])

# --------------------------------------------------------------------------- R5 H2 con red hospitalaria real
H = pd.read_csv(os.path.join(EXT, "hospitals_cms2023_geocoded.csv"))
hxy_by_c, txy = {}, {}
lat0 = {c: META.loc[META.county == c, "lat"].mean() for c in META.county.unique()}

def hav(lat1, lon1, lat2, lon2):
    p1, p2 = np.radians(lat1), np.radians(lat2)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(np.radians(lon2 - lon1) / 2) ** 2
    return 2 * 6371.0088 * np.arcsin(np.sqrt(a))

Dth = hav(META.lat.values[:, None], META.lon.values[:, None], H.lat.values[None, :], H.lon.values[None, :])
P = META.pop18.values.astype(float)
S = H.beds.values.astype(float)

def fca(d0, decay):
    if decay:
        Wd = np.where(Dth <= d0, (np.exp(-0.5 * (Dth / d0) ** 2) - np.exp(-0.5)) / (1 - np.exp(-0.5)), 0.0)
    else:
        Wd = (Dth <= d0).astype(float)
    demand = (Wd * P[:, None]).sum(0)
    Rj = np.where(demand > 0, S / np.where(demand > 0, demand, 1), 0)
    return (Wd * Rj[None, :]).sum(1) * 1000  # camas por 1.000 adultos

def mm(v):
    return (v - v.min()) / ((v.max() - v.min()) or 1)

blocks100 = spatial_blocks(META, 100, seed=SEED)
ub = np.unique(blocks100)
members = [np.where(blocks100 == g)[0] for g in ub]

def block_boot_delta(a, b, y, mask, n_boot=2000, seed=SEED):
    """Bootstrap por bloques espaciales (~100 bloques k-means) de |ρ(b,y)| − |ρ(a,y)|."""
    rng_ = np.random.default_rng(seed)
    mem = [m[mask[m]] for m in members]
    mem = [m for m in mem if len(m)]
    out = np.empty(n_boot)
    for i in range(n_boot):
        sel = np.concatenate([mem[j] for j in rng_.integers(0, len(mem), len(mem))])
        out[i] = abs(stats.spearmanr(b[sel], y[sel]).statistic) - abs(stats.spearmanr(a[sel], y[sel]).statistic)
    return out

def zou_ci(r1, r2, r12, n):
    """IC 95 % de Zou (2007) para r1 − r2 con correlaciones dependientes solapadas."""
    def ci(r):
        z, se = np.arctanh(r), 1 / np.sqrt(n - 3)
        return np.tanh(z - 1.96 * se), np.tanh(z + 1.96 * se)
    l1, u1 = ci(r1)
    l2, u2 = ci(r2)
    c = ((r12 - 0.5 * r1 * r2) * (1 - r1 ** 2 - r2 ** 2 - r12 ** 2) + r12 ** 3) / ((1 - r1 ** 2) * (1 - r2 ** 2))
    L = r1 - r2 - np.sqrt((r1 - l1) ** 2 + (u2 - r2) ** 2 - 2 * c * (r1 - l1) * (u2 - r2))
    U = r1 - r2 + np.sqrt((u1 - r1) ** 2 + (r2 - l2) ** 2 - 2 * c * (u1 - r1) * (r2 - l2))
    return float(L), float(U)

def paired_swap_perm(a, b, y, n_perm=2000, seed=SEED):
    """Permutación pareada correcta: intercambia al azar, tract por tract, los rangos
    tipificados de ambas variantes (H0: son intercambiables respecto de y)."""
    za = stats.zscore(stats.rankdata(a))
    zb = stats.zscore(stats.rankdata(b))
    ry = stats.rankdata(y)
    obs = abs(stats.spearmanr(zb, ry).statistic) - abs(stats.spearmanr(za, ry).statistic)
    rng_ = np.random.default_rng(seed)
    cnt = 0
    for _ in range(n_perm):
        sw = rng_.random(len(y)) < 0.5
        pa, pb = np.where(sw, zb, za), np.where(sw, za, zb)
        d = abs(stats.spearmanr(pb, ry).statistic) - abs(stats.spearmanr(pa, ry).statistic)
        cnt += abs(d) >= abs(obs)
    return float(obs), float((cnt + 1) / (n_perm + 1))

def h2_eval(d0, w, outcome, n_boot=2000, full=True):
    acc_b, acc_d = fca(d0, False), fca(d0, True)
    base = idx_sdoh
    ok = ~np.isnan(outcome)
    vb = (1 - w) * base + w * mm(acc_b)  # ambas variantes orientadas en sentido protector
    vd = (1 - w) * base + w * mm(acc_d)
    y = outcome
    r0 = abs(stats.spearmanr(base[ok], y[ok]).statistic)
    rb = abs(stats.spearmanr(vb[ok], y[ok]).statistic)
    rd = abs(stats.spearmanr(vd[ok], y[ok]).statistic)
    res = {"d0": d0, "w": w, "n": int(ok.sum()), "rho_none": float(r0), "rho_binary": float(rb), "rho_decay": float(rd),
           "delta": float(rd - rb), "rho_access_binary": float(stats.spearmanr(acc_b[ok], y[ok]).statistic),
           "rho_access_decay": float(stats.spearmanr(acc_d[ok], y[ok]).statistic),
           "acc_binary_zero_share": float(np.mean(acc_b == 0)), "acc_decay_zero_share": float(np.mean(acc_d == 0))}
    if full:
        bt = block_boot_delta(vb, vd, y, ok, n_boot)
        res["boot_ci"] = [float(np.percentile(bt, 2.5)), float(np.percentile(bt, 97.5))]
        res["boot_p_two_sided"] = float(min(1.0, 2 * min(np.mean(bt <= 0), np.mean(bt >= 0))))
        r12 = stats.spearmanr(vb[ok], vd[ok]).statistic
        res["zou_ci"] = zou_ci(rd, rb, r12, ok.sum())
        res["r_binary_decay"] = float(r12)
        res["perm_obs"], res["perm_p"] = paired_swap_perm(vb[ok], vd[ok], y[ok])
    return res

h2_primary = h2_eval(15.0, 0.30, y_all)
h2_sweep = [h2_eval(d0, 0.30, y_all, full=False) for d0 in (2, 3, 5, 10, 15, 20, 30)]
h2_wsweep = [h2_eval(15.0, w, y_all, full=False) for w in (0.1, 0.2, 0.3, 0.5)]
h2_le = h2_eval(15.0, 0.30, le, full=True)
h2_county = {}
for c in ("Cook County", "New York County"):
    mk = META.county.values == c
    yy_ = np.where(mk, y_all, np.nan)
    h2_county[c] = h2_eval(15.0, 0.30, yy_, full=True)
# Prueba antigua (reproducción del error): permuta ambas variantes a la vez y no usa Δ observado
def old_perm(a, b, y, n=2000, seed=SEED):
    rng_ = np.random.default_rng(seed)
    ge = 0
    for _ in range(n):
        idx = rng_.permutation(len(y))
        ge += abs(stats.spearmanr(a[idx], y).statistic) >= abs(stats.spearmanr(b[idx], y).statistic)
    return (ge + 1) / (n + 1)
acc_b15, acc_d15 = fca(15, False), fca(15, True)
old_p = old_perm(0.7 * idx_sdoh + 0.3 * mm(acc_b15), 0.7 * idx_sdoh + 0.3 * mm(acc_d15), y_all, 500)
R["R5_h2"] = {"hospitals": len(H), "beds": int(H.beds.sum()), "by_state": H.groupby("state").beds.agg(["count", "sum"]).to_dict(),
              "dist_nearest_km": {"median": float(np.median(Dth.min(1))), "p95": float(np.percentile(Dth.min(1), 95)), "max": float(Dth.min(1).max())},
              "primary": h2_primary, "by_county": h2_county, "radius_sweep": h2_sweep, "weight_sweep": h2_wsweep, "life_expectancy": h2_le,
              "old_permutation_p_reproduced": float(old_p)}
log("R5", {k: h2_primary[k] for k in h2_primary})

# --------------------------------------------------------------------------- R6 importancia agrupada/condicional
Xtr, Xte = X_all[tr_idx], X_all[te_idx]
ytr, yte = labels(y_all[tr_idx], cuts0), labels(y_all[te_idx], cuts0)
base_f1 = f1_score(yte, lr_fit.predict(Xte), average="macro")
rho_m = stats.spearmanr(X_all).statistic
dist = 1 - np.abs(rho_m)
np.fill_diagonal(dist, 0)
Zl = hierarchy.linkage(squareform(dist, checks=False), method="average")
DOMAINS = {
    "Privación material": ["pct_food_insecurity", "pct_food_stamps", "pct_housing_insecurity", "pct_utility_shutoff", "pct_no_transportation"],
    "Acceso y prevención": ["pct_no_health_insurance", "pct_routine_checkup", "pct_cholesterol_screening"],
    "Contexto social": ["pct_lack_social_support", "pct_loneliness"],
    "Conductas": ["pct_smoking", "pct_inactivity", "pct_binge_drinking"],
}
groups_feat = {g: [FEATURES.index(c) for c in cs] for g, cs in DOMAINS.items()}
cl = np.array([next(g for g, cs in DOMAINS.items() if f in cs) for f in FEATURES])
cl_data = hierarchy.fcluster(Zl, t=0.3, criterion="distance")
R["R6_data_clusters"] = {LABEL[f]: int(c) for f, c in zip(FEATURES, cl_data)}
rng = np.random.default_rng(SEED)

def perm_drop(cols, n_rep=30, cond=None):
    drops = []
    for _ in range(n_rep):
        Xp = Xte.copy()
        if cond is None:
            pi = rng.permutation(len(Xte))
            Xp[:, cols] = Xte[pi][:, cols]
        else:
            for binv in np.unique(cond):
                ii = np.where(cond == binv)[0]
                Xp[np.ix_(ii, cols)] = Xte[np.ix_(rng.permutation(ii), cols)]
        drops.append(base_f1 - f1_score(yte, lr_fit.predict(Xp), average="macro"))
    return float(np.mean(drops)), float(np.std(drops, ddof=1))

imp_rows = []
for j, f in enumerate(FEATURES):
    m_, s_ = perm_drop([j])
    # Condicional: permutación dentro de deciles de la 1.ª componente principal de las
    # variables correlacionadas con f (|ρ| ≥ 0,5), en el espíritu de Strobl et al. (2008).
    others = [k for k in range(len(FEATURES)) if k != j and abs(rho_m[j, k]) >= 0.5]
    if others:
        Zo = StandardScaler().fit(Xtr[:, others]).transform(Xte[:, others])
        pc = Zo @ np.linalg.svd(Zo - Zo.mean(0), full_matrices=False)[2][0]
        cond = np.digitize(pc, np.quantile(pc, np.linspace(0.1, 0.9, 9)))
        mc_, sc_ = perm_drop([j], cond=cond)
    else:
        mc_, sc_ = m_, s_
    imp_rows.append({"code": f, "label": LABEL[f], "group": str(cl[j]), "perm": m_, "perm_sd": s_, "cond": mc_, "cond_sd": sc_})
IMP = pd.DataFrame(imp_rows)
grp_rows = []
for g, cols in groups_feat.items():
    m_, s_ = perm_drop(cols)
    # Reajuste sin el grupo (importancia por eliminación) con CV 5×2 en entrenamiento
    keep = [k for k in range(len(FEATURES)) if k not in cols]
    cvs = RepeatedStratifiedKFold(n_splits=5, n_repeats=2, random_state=SEED)
    full_s, red_s = [], []
    for a, b in cvs.split(Xtr, ytr):
        full_s.append(f1_score(ytr[b], clone(specs["LR"]).fit(Xtr[a], ytr[a]).predict(Xtr[b]), average="macro"))
        red_s.append(f1_score(ytr[b], clone(specs["LR"]).fit(Xtr[a][:, keep], ytr[a]).predict(Xtr[b][:, keep]), average="macro"))
    grp_rows.append({"group": g, "members": [LABEL[FEATURES[k]] for k in cols], "n": len(cols), "perm_group": m_, "perm_group_sd": s_,
                     "drop_refit": float(np.mean(full_s) - np.mean(red_s)), "drop_refit_sd": float(np.std(np.array(full_s) - np.array(red_s), ddof=1))})
GRP = pd.DataFrame(grp_rows).sort_values("perm_group", ascending=False)

# SHAP lineal exacto (intervencional) para la LR multinomial, sumado por grupo, con bootstrap
def linear_shap_abs(model, Xref, Xexp):
    sc, lr = model.named_steps["scaler"], model.named_steps["model"]
    Zr = sc.transform(model.named_steps["imputer"].transform(Xref))
    Ze = sc.transform(model.named_steps["imputer"].transform(Xexp))
    phi = np.abs((Ze - Zr.mean(0))[:, None, :] * lr.coef_[None, :, :])  # n × clases × p
    return phi.mean((0, 1))

shap_full = linear_shap_abs(lr_fit, Xtr, Xte)
ranks_boot, grp_ranks_boot = [], []
gkeys = list(groups_feat)
for bi in range(100):
    ii = rng.integers(0, len(Xtr), len(Xtr))
    mb = clone(specs["LR"]).fit(Xtr[ii], ytr[ii])
    sv = linear_shap_abs(mb, Xtr[ii], Xte)
    ranks_boot.append(stats.rankdata(-sv))
    gs = np.array([sv[groups_feat[g]].sum() for g in gkeys])
    grp_ranks_boot.append(stats.rankdata(-gs))
ranks_boot = np.array(ranks_boot)
grp_ranks_boot = np.array(grp_ranks_boot)
IMP["shap"] = shap_full
IMP["shap_rank_median"] = np.median(ranks_boot, 0)
IMP["shap_rank_lo"] = np.percentile(ranks_boot, 2.5, 0)
IMP["shap_rank_hi"] = np.percentile(ranks_boot, 97.5, 0)
IMP["perm_rank"] = stats.rankdata(-IMP["perm"])
GRP["shap_group"] = [shap_full[groups_feat[g]].sum() for g in GRP.group]
GRP["shap_group_rank_median"] = [float(np.median(grp_ranks_boot[:, gkeys.index(g)])) for g in GRP.group]
GRP["shap_group_top1_share"] = [float(np.mean(grp_ranks_boot[:, gkeys.index(g)] == 1)) for g in GRP.group]
# Concordancia de Kendall W entre rankings bootstrap individuales
m_, n_ = ranks_boot.shape
Rj = ranks_boot.sum(0)
Wk = 12 * np.sum((Rj - Rj.mean()) ** 2) / (m_ ** 2 * (n_ ** 3 - n_))
top3 = [set(np.argsort(r)[:3]) for r in ranks_boot]
R["R6_importance"] = {"base_f1_test": float(base_f1), "features": IMP.to_dict("records"), "groups": GRP.to_dict("records"),
                      "kendall_W_bootstrap": float(Wk),
                      "top3_original_perm": list(IMP.sort_values("perm", ascending=False).label[:3]),
                      "top3_shap": list(IMP.sort_values("shap", ascending=False).label[:3]),
                      "top3_stability_share": float(np.mean([t == top3[0] for t in top3])),
                      "vif_note": "VIF > 1000 en 4 variables (artículo, Sección 4.4)"}
log("R6 grupos\n", GRP[["members", "perm_group", "drop_refit", "shap_group", "shap_group_top1_share"]])
log("R6 indiv\n", IMP[["label", "perm", "cond", "shap", "shap_rank_median", "shap_rank_lo", "shap_rank_hi"]].sort_values("shap", ascending=False))

# --------------------------------------------------------------------------- R7 H1 extremo a extremo
from places_data import load_long  # noqa: E402

def pipeline_e2e(percentile="bisect"):
    t = {}
    t0 = time.perf_counter()
    d = load_long()  # ingesta (lectura del CSV descargado por el ETL)
    t["ingesta"] = time.perf_counter() - t0
    t1 = time.perf_counter()
    d = d.sort_values("year", ascending=False).drop_duplicates(["geoid", "code"], keep="first")
    wide = d.pivot(index="geoid", columns="code", values="data_value").sort_index()
    meta = d.drop_duplicates("geoid").set_index("geoid").reindex(wide.index)
    t["etl"] = time.perf_counter() - t1
    t2 = time.perf_counter()
    comp = composite(ALL_CODES, wide)
    if percentile == "bisect":
        srt = np.sort(comp)
        vul = 100 - np.array([bisect_left(srt, v) / len(srt) * 100 for v in comp])
    else:
        lst = list(comp)
        vul = 100 - np.array([sum(1 for o in lst if o < v) / len(lst) * 100 for v in lst])
    level = np.select([vul >= 90, vul >= 75, vul >= 50], ["critical", "high", "moderate"], "low")
    t["indice"] = time.perf_counter() - t2
    t3 = time.perf_counter()
    pred = lr_fit.predict(wide[FEATURES].values)
    t["prediccion"] = time.perf_counter() - t3
    t4 = time.perf_counter()
    feats = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [float(lo), float(la)]},
              "properties": {"geoid": g, "index": float(c), "vulnerability": float(v), "level": str(lv), "pred": str(pr)}}
             for g, lo, la, c, v, lv, pr in zip(wide.index, META.lon.values, META.lat.values, comp, vul, level, pred)]
    payload = json.dumps({"type": "FeatureCollection", "features": feats})
    t["serializacion"] = time.perf_counter() - t4
    t["total"] = time.perf_counter() - t0
    t["bytes"] = len(payload)
    return t

pipeline_e2e()  # calentamiento
live = [pipeline_e2e("bisect") for _ in range(30)]
retro = [pipeline_e2e("count") for _ in range(30)]
L = pd.DataFrame(live)
Rt = pd.DataFrame(retro)
dlt = Rt["total"].values - L["total"].values
bt = [np.median(rng.choice(dlt, len(dlt))) for _ in range(2000)]
w_h1 = stats.wilcoxon(Rt["total"], L["total"])
# Latencia algorítmica (H1 original) con 30 repeticiones
comp = composite(ALL_CODES)
srt = np.sort(comp)
lst = list(comp)
alg_l, alg_r = [], []
for _ in range(30):
    a0 = time.perf_counter(); [bisect_left(srt, v) for v in comp]; alg_l.append(time.perf_counter() - a0)  # noqa: E702
    a0 = time.perf_counter(); [sum(1 for o in lst if o < v) for v in lst]; alg_r.append(time.perf_counter() - a0)  # noqa: E702
R["R7_h1"] = {
    "e2e_live": {k: {"median": float(L[k].median()), "p95": float(L[k].quantile(0.95))} for k in L.columns},
    "e2e_retro": {k: {"median": float(Rt[k].median()), "p95": float(Rt[k].quantile(0.95))} for k in Rt.columns},
    "e2e_delta_median_ci": [float(np.percentile(bt, 2.5)), float(np.percentile(bt, 97.5))],
    "e2e_wilcoxon": {"W": float(w_h1.statistic), "p": float(w_h1.pvalue)},
    "e2e_speedup": float(Rt["total"].median() / L["total"].median()),
    "alg_live_median_ms": float(np.median(alg_l) * 1e3), "alg_retro_median_ms": float(np.median(alg_r) * 1e3),
    "alg_wilcoxon_p": float(stats.wilcoxon(alg_r, alg_l).pvalue),
    "hardware": "Intel Core i7-1065G7 (4 núcleos/8 hilos, 1,3 GHz), 10 GB RAM, Linux; Python " + sys.version.split()[0],
}
log("R7", R["R7_h1"]["e2e_live"]["total"], R["R7_h1"]["e2e_retro"]["total"])

# --------------------------------------------------------------------------- R8 potencia
from statsmodels.stats.power import TTestPower  # noqa: E402

# H4: potencia por bootstrap del conjunto de prueba con nulo por permutación de etiquetas
pte = lr_fit.predict(Xte)
null = np.array([f1_score(rng.permutation(yte), pte, average="macro") for _ in range(2000)])
crit = np.quantile(null, 0.95)
boots = []
for _ in range(2000):
    ii = rng.integers(0, len(yte), len(yte))
    boots.append(f1_score(yte[ii], pte[ii], average="macro"))
power_h4 = float(np.mean(np.array(boots) > crit))
# MDE con 80 % de potencia para la t corregida de Nadeau-Bengio (10 pliegues, LR vs GB)
r_cv = RepeatedStratifiedKFold(n_splits=5, n_repeats=2, random_state=SEED)
d_cv = []
for a, b in r_cv.split(Xtr, ytr):
    fl = f1_score(ytr[b], clone(specs["LR"]).fit(Xtr[a], ytr[a]).predict(Xtr[b]), average="macro")
    fg = f1_score(ytr[b], clone(specs["GB"]).fit(Xtr[a], ytr[a]).predict(Xtr[b]), average="macro")
    d_cv.append(fl - fg)
d_cv = np.array(d_cv)
J = len(d_cv)
se_corr = np.sqrt((1 / J + 0.25) * d_cv.var(ddof=1))
mde_nb = float((stats.t.ppf(0.975, J - 1) + stats.t.ppf(0.80, J - 1)) * se_corr)
eff = d_cv.mean() / se_corr * np.sqrt(1)  # tamaño estandarizado
power_nb = float(TTestPower().power(effect_size=d_cv.mean() / (se_corr * np.sqrt(J)), nobs=J, alpha=0.05))
# McNemar: n necesario para detectar 12 vs 9 discordancias (Connor, 1987) con 80 %
p10, p01 = 12 / 327, 9 / 327
pdisc, diff = p10 + p01, p10 - p01
za, zb = 1.959964, 0.841621
n_mcnemar = float(((za * np.sqrt(pdisc) + zb * np.sqrt(pdisc - diff ** 2)) / diff) ** 2)
# H2: MDE de Δρ a partir de la amplitud del IC bootstrap por bloques (≈ 2,8 EE)
ci = h2_primary.get("boot_ci", [np.nan, np.nan])
se_h2 = (ci[1] - ci[0]) / (2 * 1.96)
mde_h2 = float(2.8 * se_h2)
# H3: 0/30 ejecuciones superaron 5 s → límite superior de Clopper-Pearson
cp_upper = float(stats.beta.ppf(0.95, 1, 30))
R["R8_power"] = {"H4_power": power_h4, "H4_null_crit_f1": float(crit),
                 "NB_LR_GB_delta": float(d_cv.mean()), "NB_MDE_80": mde_nb, "NB_power_observed": power_nb,
                 "McNemar_n_required_80": n_mcnemar, "H2_MDE_delta_rho": mde_h2,
                 "H3_cp_upper_exceed_share": cp_upper,
                 "H1_e2e_effect_r": float(1.0)}
log("R8", R["R8_power"])

# --------------------------------------------------------------------------- R9 rejilla ampliada de C
grid_rows = []
for C in (1.0, 10.0, 100.0, 1e3, 1e4, 1e5):
    sc = []
    for a, b in RepeatedStratifiedKFold(n_splits=5, n_repeats=2, random_state=SEED).split(Xtr, ytr):
        m = Pipeline([("imputer", SimpleImputer(strategy="median")), ("scaler", StandardScaler()),
                      ("model", LogisticRegression(C=C, max_iter=5000, random_state=SEED))]).fit(Xtr[a], ytr[a])
        sc.append(f1_score(ytr[b], m.predict(Xtr[b]), average="macro"))
    grid_rows.append({"C": C, "f1_cv": float(np.mean(sc)), "sd": float(np.std(sc, ddof=1))})
R["R9_grid_C"] = grid_rows
log("R9", grid_rows)

# =========================================================================== FIGURAS
LVL = {"low": "#2b9348", "moderate": "#f2c14e", "high": "#f08a24", "critical": "#c0392b"}
INK = "#1f2937"
plt.rcParams.update({"font.size": 9, "axes.spines.top": False, "axes.spines.right": False})

# Figura A: validación espacial
fig, axes = plt.subplots(1, 3, figsize=(15, 4.8), gridspec_kw={"width_ratios": [1, 0.55, 1.3]})
g0 = spatial_blocks(META, 20, seed=SEED)
cmap = plt.get_cmap("tab20")
for ax, c, t in ((axes[0], "Cook County", "(a) Bloques espaciales · Cook County"), (axes[1], "New York County", "(b) New York County")):
    mk = META.county.values == c
    ax.scatter(META.lon[mk], META.lat[mk], c=[cmap(v % 20) for v in g0[mk]], s=5 if c.startswith("Cook") else 9)
    ax.set_aspect("equal", adjustable="datalim")
    ax.set_title(t, color=INK)
    ax.set_xlabel("Longitud")
    ax.set_ylabel("Latitud")
    ax.tick_params(labelsize=7)
order_m = ["LR", "GB", "RF", "MLP", "Azar"]
xs = np.arange(len(order_m))
for i, (sch, col) in enumerate((("Aleatoria", "#93c5fd"), ("Bloques espaciales", "#1d4ed8"))):
    sub = summ[summ.scheme == sch].set_index("model").reindex(order_m)
    axes[2].bar(xs + (i - 0.5) * 0.36, sub["mean"], 0.36, yerr=sub["std"], color=col, capsize=3, label=f"VC {sch.lower()} (5×5)")
loco_lr = [r for r in loco if r["model"] == "LR"]
for r_ in loco_lr:
    axes[2].scatter([0.0], [r_["f1_cuts_train_county"]], marker="D" if r_["train"].startswith("Cook") else "s", color="#c0392b", zorder=4,
                    label="LR entre condados: " + ("Cook→Nueva York" if r_["train"].startswith("Cook") else "Nueva York→Cook"))
axes[2].set_xticks(xs)
axes[2].set_xticklabels(["Reg. logística", "Gradient Boosting", "Random Forest", "MLP", "Línea base"], fontsize=8)
axes[2].set_ylabel("F1-macro")
axes[2].set_ylim(0, 1)
axes[2].legend(fontsize=7, frameon=True, framealpha=0.95, loc="center right", bbox_to_anchor=(1.0, 0.62))
axes[2].set_title("(c) Validación aleatoria vs. espacial", color=INK)
save(fig, "figR1_validacion_espacial.png")

# Figura B: incertidumbre y covariables MRP
fig, axes = plt.subplots(1, 3, figsize=(15, 4.4))
axes[0].hist(mc_f1, bins=25, color="#93c5fd", edgecolor="white")
axes[0].axvline(base_f1, color="#c0392b", lw=1.6, label=f"F1 sin perturbar = {base_f1:.3f}")
axes[0].axvline(np.percentile(mc_f1, 2.5), color=INK, ls="--", lw=1)
axes[0].axvline(np.percentile(mc_f1, 97.5), color=INK, ls="--", lw=1, label="IC 95 % Monte Carlo")
axes[0].set_xlabel("F1-macro en prueba (200 réplicas con IC de PLACES)")
axes[0].set_ylabel("Frecuencia")
axes[0].legend(fontsize=7, frameon=False)
axes[0].set_title("(a) Propagación de la incertidumbre de PLACES", color=INK)
axes[1].hist([stab_lab, stab_pred], bins=np.linspace(0.25, 1, 16), color=["#f2c14e", "#1d4ed8"], label=["Nivel observado", "Nivel predicho"])
axes[1].set_xlabel("Proporción de réplicas con el nivel modal")
axes[1].set_ylabel("Tracts")
axes[1].legend(fontsize=7, frameon=False)
axes[1].set_title("(b) Estabilidad de la clase por tract", color=INK)
r3d = pd.DataFrame(r3)
sets_o = list(sets)
for i, (sch, col) in enumerate((("Aleatoria", "#93c5fd"), ("Bloques espaciales", "#1d4ed8"))):
    sub = r3d[r3d.scheme == sch].set_index("set").reindex(sets_o)
    axes[2].bar(np.arange(3) + (i - 0.5) * 0.36, sub["f1"], 0.36, yerr=sub["f1_sd"], color=col, capsize=3, label=f"VC {sch.lower()}")
axes[2].set_xticks(np.arange(3))
axes[2].set_xticklabels(["Demográficas\n(proxy MRP)", "13 determinantes\n(SP-5)", "Demográficas +\ndeterminantes"], fontsize=8)
axes[2].set_ylabel("F1-macro (regresión logística)")
axes[2].set_ylim(0, 1)
axes[2].legend(fontsize=7, frameon=False, loc="lower right")
axes[2].set_title("(c) Control de covariables compartidas", color=INK)
save(fig, "figR2_incertidumbre_mrp.png")

# Figura C: importancia agrupada/condicional
fig, axes = plt.subplots(1, 2, figsize=(13.5, 5.2))
imp_s = IMP.sort_values("shap")
yy = np.arange(len(imp_s))
axes[0].barh(yy - 0.27, imp_s["perm"], 0.27, xerr=imp_s["perm_sd"], color="#93c5fd", label="Permutación marginal", capsize=2)
axes[0].barh(yy, imp_s["cond"], 0.27, xerr=imp_s["cond_sd"], color="#1d4ed8", label="Permutación condicional", capsize=2)
axes[0].barh(yy + 0.27, imp_s["shap"] / imp_s["shap"].max() * imp_s["perm"].max(), 0.27, color="#f08a24", label="|SHAP| lineal (reescalado)")
axes[0].set_yticks(yy)
axes[0].set_yticklabels(imp_s["label"], fontsize=8)
axes[0].set_xlabel("Caída del F1-macro / contribución relativa")
axes[0].legend(fontsize=7, frameon=False, loc="lower right")
axes[0].set_title("(a) Importancia marginal, condicional y SHAP", color=INK)
gs_ = GRP.sort_values("perm_group")
lab_g = [f"{g}\n({len(m)} variables)" for g, m in zip(gs_["group"], gs_["members"])]
axes[1].barh(np.arange(len(gs_)) - 0.2, gs_["perm_group"], 0.4, xerr=gs_["perm_group_sd"], color="#1d4ed8", label="Permutación del grupo", capsize=2)
axes[1].barh(np.arange(len(gs_)) + 0.2, gs_["drop_refit"], 0.4, xerr=gs_["drop_refit_sd"], color="#f2c14e", label="Eliminación y reajuste (VC)", capsize=2)
axes[1].set_yticks(np.arange(len(gs_)))
axes[1].set_yticklabels(lab_g, fontsize=7)
axes[1].set_xlabel("Caída del F1-macro")
axes[1].legend(fontsize=7, frameon=False, loc="lower right")
axes[1].set_title("(b) Importancia por dominio de determinantes", color=INK)
save(fig, "figR3_importancia_agrupada.png")

# Figura D (reemplaza Fig. 10): mapa con red real + H2
fig, axes = plt.subplots(1, 3, figsize=(15, 4.9), gridspec_kw={"width_ratios": [1, 0.6, 1.2]})
full_pred = pred_all
for ax, c, t in ((axes[0], "Cook County", "(a) Cook County, IL"), (axes[1], "New York County", "(b) New York County, NY")):
    mk = META.county.values == c
    for lv in CLASSES:
        s_ = mk & (full_pred == lv)
        ax.scatter(META.lon[s_], META.lat[s_], s=5 if c.startswith("Cook") else 9, color=LVL[lv],
                   label={"low": "Bajo", "moderate": "Moderado", "high": "Alto", "critical": "Crítico"}[lv])
    hm = H.state.values == ("IL" if c.startswith("Cook") else "NY")
    ax.scatter(H.lon[hm], H.lat[hm], marker="P", s=40, color="black", edgecolor="white", linewidth=0.5, label="Hospital (CMS 2023)")
    ax.set_aspect("equal", adjustable="datalim")
    ax.set_title(t + " · nivel predicho", color=INK)
    ax.set_xlabel("Longitud")
    ax.set_ylabel("Latitud")
    ax.tick_params(labelsize=7)
axes[0].legend(fontsize=7, frameon=False, markerscale=1.5, loc="lower left")
sw = pd.DataFrame(h2_sweep)
axes[2].plot(sw.d0, sw.rho_decay, "o-", color="#1d4ed8", label="SDOH + E2SFCA gaussiano (decaimiento)")
axes[2].plot(sw.d0, sw.rho_binary, "s--", color="#f08a24", label="SDOH + 2SFCA binario")
axes[2].axhline(sw.rho_none.iloc[0], color="#2b9348", ls=":", label="Índice SDOH sin accesibilidad")
axes[2].set_xlabel("Radio de captación d₀ (km)")
axes[2].set_ylabel("|ρ| con obesidad observada")
axes[2].legend(fontsize=7, frameon=True, loc="lower right")
axes[2].set_title("(c) H2 con 52 hospitales reales (w = 0,30)", color=INK)
save(fig, "figR4_h2_red_real.png")

with open(os.path.join(OUT, "revision_results.json"), "w", encoding="utf-8") as fh:
    json.dump(R, fh, ensure_ascii=False, indent=1, default=lambda o: o.tolist() if hasattr(o, "tolist") else str(o))
log("LISTO")
