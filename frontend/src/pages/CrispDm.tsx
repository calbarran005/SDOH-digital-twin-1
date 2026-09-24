import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Brain,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Gauge,
  PlayCircle,
  Rocket,
  Target,
  Wand2,
  XCircle,
} from "lucide-react";
import api from "../api/client";
import { errorMessage } from "../api/errors";
import StatCard from "../components/StatCard";
import type { CrispPhase, CrispPhaseOverview } from "../types";

const PHASE_META: Record<
  string,
  { icon: typeof Target; endpoint: string; color: string }
> = {
  "business-understanding": { icon: Target, endpoint: "/crispdm/business-understanding", color: "#60a5fa" },
  "data-understanding": { icon: Database, endpoint: "/crispdm/data-understanding", color: "#34d399" },
  "data-preparation": { icon: Wand2, endpoint: "/crispdm/data-preparation", color: "#a78bfa" },
  modeling: { icon: Brain, endpoint: "/crispdm/modeling", color: "#fbbf24" },
  evaluation: { icon: ClipboardCheck, endpoint: "/crispdm/evaluation", color: "#fb923c" },
  deployment: { icon: Rocket, endpoint: "/crispdm/deployment", color: "#f472b6" },
};

const RISK_COLORS: Record<string, string> = {
  low: "#10b981",
  moderate: "#f59e0b",
  high: "#f97316",
  critical: "#ef4444",
};

const num = (v: unknown, digits = 2) =>
  typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: digits }) : "—";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {children}
    </div>
  );
}

function KeyValue({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <div className="grid grid-2" style={{ gap: 10 }}>
      {items.map(([k, v]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: "1px solid var(--border-subtle)" }}>
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>{k}</span>
          <span style={{ fontWeight: 600, fontFamily: "var(--font-mono)", textAlign: "right" }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 7 }}>
      {items.map((i) => (
        <li key={i} style={{ color: "var(--text-muted)", fontSize: 13.5, lineHeight: 1.55 }}>{i}</li>
      ))}
    </ul>
  );
}

export default function CrispDm() {
  const { t } = useTranslation();
  const { phase } = useParams<{ phase?: string }>();
  const [overview, setOverview] = useState<CrispPhaseOverview | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState<number | "">("");

  const activeKey = phase && PHASE_META[phase] ? phase : null;
  const meta = activeKey ? PHASE_META[activeKey] : null;

  const loadOverview = useCallback(() => {
    api.get("/crispdm/phases").then((r) => {
      setOverview(r.data);
      setYear((y) => (y === "" ? r.data.year : y));
    }).catch(() => {});
  }, []);

  useEffect(loadOverview, [loadOverview]);

  const loadPhase = useCallback(() => {
    if (!meta || !activeKey) { setData(null); return; }
    setLoading(true);
    setError(null);
    const q = year === "" || activeKey === "business-understanding" || activeKey === "deployment"
      ? "" : `?year=${year}`;
    api.get(`${meta.endpoint}${q}`)
      .then((r) => setData(r.data))
      .catch((e) => setError(errorMessage(e, t("crispdm.loadError"))))
      .finally(() => setLoading(false));
  }, [meta, activeKey, year, t]);

  useEffect(loadPhase, [loadPhase]);

  const runPipeline = async () => {
    setRunning(true);
    setError(null);
    try {
      await api.post(`/crispdm/pipeline/run${year === "" ? "" : `?year=${year}`}`);
      loadOverview();
      loadPhase();
    } catch (e: any) {
      setError(errorMessage(e, t("crispdm.runError")));
    } finally {
      setRunning(false);
    }
  };

  const runEvaluation = async () => {
    setRunning(true);
    setError(null);
    try {
      const r = await api.post(`/crispdm/evaluation/run${year === "" ? "" : `?year=${year}`}`);
      setData({ ...r.data, __benchmark: true });
    } catch (e: any) {
      setError(errorMessage(e, t("crispdm.runError")));
    } finally {
      setRunning(false);
    }
  };

  const current: CrispPhase | undefined = useMemo(
    () => overview?.phases.find((p) => p.key === activeKey),
    [overview, activeKey]
  );

  return (
    <div>
      <div className="topbar">
        <div className="page-title-group">
          <h2 className="page-title">
            {current ? `${current.roman}. ${current.name}` : t("crispdm.title")}
          </h2>
          <p className="page-subtitle">
            {current ? current.question : t("crispdm.subtitle")}
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
              {t("common.year")}:
            </span>
            <input
              className="input"
              type="number"
              style={{ width: 88 }}
              value={year}
              onChange={(e) => setYear(e.target.value === "" ? "" : +e.target.value)}
            />
          </div>
          {activeKey === "evaluation" && (
            <button className="btn" onClick={runEvaluation} disabled={running}>
              <Gauge size={16} />
              <span>{running ? t("crispdm.running") : t("crispdm.runBenchmark")}</span>
            </button>
          )}
          <button className="btn" onClick={runPipeline} disabled={running}>
            <PlayCircle size={16} />
            <span>{running ? t("crispdm.running") : t("crispdm.runPipeline")}</span>
          </button>
        </div>
      </div>

      {/* Stepper de las seis fases */}
      {overview && (
        <div className="card" style={{ marginBottom: 22, overflowX: "auto" }}>
          <div style={{ display: "flex", gap: 10, minWidth: 720 }}>
            {overview.phases.map((p) => {
              const Icon = PHASE_META[p.key]?.icon ?? Target;
              const isActive = p.key === activeKey;
              return (
                <div
                  key={p.key}
                  style={{
                    flex: 1,
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: `1px solid ${isActive ? "rgba(59,130,246,0.55)" : "var(--border-subtle)"}`,
                    background: isActive ? "rgba(59,130,246,0.10)" : "transparent",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <Icon size={16} style={{ color: PHASE_META[p.key]?.color }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)" }}>
                      {p.roman}
                    </span>
                    {p.ready ? (
                      <CheckCircle2 size={14} style={{ color: "#10b981", marginLeft: "auto" }} />
                    ) : (
                      <XCircle size={14} style={{ color: "var(--text-dim)", marginLeft: "auto" }} />
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.3 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 3 }}>{p.layer}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {error && <div className="card" style={{ marginBottom: 22 }}><span className="error-text">{error}</span></div>}
      {loading && <div className="empty-state">{t("common.loading")}</div>}

      {/* Vista general */}
      {!activeKey && overview && (
        <>
          <div className="grid grid-4" style={{ marginBottom: 22 }}>
            <StatCard label={t("crispdm.phasesReady")} value={`${overview.completed}/${overview.total}`} icon={<CheckCircle2 size={22} style={{ color: "#10b981" }} />} subtext="CRISP-DM" />
            <StatCard label={t("crispdm.tracts")} value={overview.counts.tracts} icon={<Database size={22} style={{ color: "#34d399" }} />} />
            <StatCard label={t("crispdm.values")} value={overview.counts.values} icon={<Wand2 size={22} style={{ color: "#a78bfa" }} />} />
            <StatCard label={t("crispdm.computedIndexes")} value={overview.counts.computed_indexes} icon={<Brain size={22} style={{ color: "#fbbf24" }} />} />
          </div>
          <Section title={t("crispdm.phaseMap")}>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th><th>{t("crispdm.phase")}</th><th>{t("crispdm.question")}</th>
                    <th>{t("crispdm.layer")}</th><th>{t("crispdm.objectives")}</th><th>{t("common.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.phases.map((p) => (
                    <tr key={p.key}>
                      <td style={{ fontFamily: "var(--font-mono)" }}>{p.roman}</td>
                      <td><b>{p.name}</b></td>
                      <td style={{ color: "var(--text-muted)" }}>{p.question}</td>
                      <td>{p.layer}</td>
                      <td>{p.objectives.join(", ")}</td>
                      <td>
                        <span className={`badge ${p.ready ? "green" : "gray"}`}>
                          {p.ready ? t("crispdm.ready") : t("crispdm.pending")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}

      {/* Fase I */}
      {activeKey === "business-understanding" && data && (
        <>
          <Section title={t("crispdm.goal")}>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.6 }}>{data.goal}</p>
            <p style={{ color: "var(--text-dim)", fontStyle: "italic", lineHeight: 1.6 }}>{data.research_question}</p>
          </Section>
          <div className="grid grid-2">
            <Section title={t("crispdm.objectives")}>
              <Bullets items={data.objectives.map((o: any) => `${o.code}: ${o.text}`)} />
            </Section>
            <Section title={t("crispdm.hypotheses")}>
              <Bullets items={data.hypotheses.map((h: any) => `${h.code}: ${h.text}`)} />
            </Section>
          </div>
          <div className="grid grid-2">
            <Section title={t("crispdm.successBusiness")}>
              <Bullets items={data.success_criteria.business} />
            </Section>
            <Section title={t("crispdm.successDataMining")}>
              <Bullets items={data.success_criteria.data_mining} />
            </Section>
          </div>
          <Section title={t("crispdm.stakeholders")}>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr><th>{t("common.name")}</th><th>{t("crispdm.roleCode")}</th><th>{t("crispdm.permissions")}</th><th>{t("crispdm.users")}</th></tr>
                </thead>
                <tbody>
                  {data.stakeholders.map((r: any) => (
                    <tr key={r.code}>
                      <td><b>{r.name}</b></td>
                      <td style={{ fontFamily: "var(--font-mono)" }}>{r.code}</td>
                      <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{r.permissions.join(" · ") || "—"}</td>
                      <td>{r.users ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <Section title={t("crispdm.constraints")}>
            <Bullets items={data.constraints} />
          </Section>
        </>
      )}

      {/* Fase II */}
      {activeKey === "data-understanding" && data && (
        <>
          <div className="grid grid-4" style={{ marginBottom: 22 }}>
            <StatCard label={t("crispdm.tracts")} value={data.counts.tracts} subtext={`${data.counts.counties} ${t("crispdm.counties")}`} icon={<Database size={22} style={{ color: "#34d399" }} />} />
            <StatCard label={t("crispdm.indicators")} value={data.counts.indicators} subtext={`${data.domains.length} ${t("crispdm.domains")}`} icon={<Database size={22} style={{ color: "#60a5fa" }} />} />
            <StatCard label={t("crispdm.values")} value={data.counts.values} subtext={`${num(data.quality.completeness)} % ${t("crispdm.completeness")}`} icon={<CheckCircle2 size={22} style={{ color: "#a78bfa" }} />} />
            <StatCard label={t("crispdm.population")} value={num(data.counts.population, 0)} subtext={data.dataset_nature} icon={<Target size={22} style={{ color: "#fbbf24" }} />} />
          </div>
          {data.warning && (
            <div className="card" style={{ marginBottom: 22, borderColor: "var(--risk-moderate-border)" }}>
              <b style={{ color: "#fbbf24" }}>⚠ {t("crispdm.datasetWarning")}</b>
              <p style={{ color: "var(--text-muted)", margin: "8px 0 0", lineHeight: 1.55 }}>{data.warning}</p>
            </div>
          )}
          <Section title={t("crispdm.profile")}>
            <div className="table-responsive" style={{ maxHeight: 420, overflowY: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("crispdm.code")}</th><th>{t("crispdm.domain")}</th><th>{t("crispdm.source")}</th>
                    <th>{t("crispdm.direction")}</th><th>n</th><th>{t("crispdm.completeness")}</th>
                    <th>min</th><th>max</th><th>media</th>
                  </tr>
                </thead>
                <tbody>
                  {data.profile.map((p: any) => (
                    <tr key={p.code}>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{p.code}</td>
                      <td>{p.domain}</td>
                      <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{p.source}</td>
                      <td><span className={`badge ${p.direction === "riesgo" ? "red" : "green"}`}>{p.direction}</span></td>
                      <td>{p.observations}</td>
                      <td><span className={`badge ${p.completeness >= 80 ? "green" : p.completeness > 0 ? "moderate" : "gray"}`}>{num(p.completeness)} %</span></td>
                      <td style={{ fontFamily: "var(--font-mono)" }}>{num(p.min)}</td>
                      <td style={{ fontFamily: "var(--font-mono)" }}>{num(p.max)}</td>
                      <td style={{ fontFamily: "var(--font-mono)" }}>{num(p.mean)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <div className="grid grid-2">
            <Section title={t("crispdm.sources")}>
              <KeyValue items={data.sources.map((s: any) => [s.source, `${s.indicators}`])} />
            </Section>
            <Section title={t("crispdm.qualityChecks")}>
              <Bullets items={data.quality.checks} />
            </Section>
          </div>
        </>
      )}

      {/* Fase III */}
      {activeKey === "data-preparation" && data && (
        <>
          <div className="grid grid-4" style={{ marginBottom: 22 }}>
            <StatCard label={t("crispdm.tractsWithData")} value={data.coverage.tracts_with_data} subtext={`${data.coverage.tracts_total} ${t("crispdm.total")}`} icon={<Wand2 size={22} style={{ color: "#a78bfa" }} />} />
            <StatCard label={t("crispdm.tractsComplete")} value={data.coverage.tracts_complete} subtext={`${data.coverage.tracts_partial} ${t("crispdm.partial")}`} icon={<CheckCircle2 size={22} style={{ color: "#10b981" }} />} />
            <StatCard label={t("crispdm.weightsSum")} value={num(data.weights_sum, 4)} subtext="Σw = 1" icon={<Brain size={22} style={{ color: "#fbbf24" }} />} />
            <StatCard label={t("crispdm.prepTime")} value={`${num(data.elapsed_seconds, 4)} s`} icon={<Gauge size={22} style={{ color: "#fb923c" }} />} />
          </div>
          <div className="grid grid-2">
            <Section title={t("crispdm.etlSteps")}>
              <Bullets items={data.steps.map((s: any) => `${s.step}: ${s.detail}`)} />
            </Section>
            <Section title={t("crispdm.transformations")}>
              <Bullets items={data.transformations} />
            </Section>
          </div>
          <Section title={t("crispdm.normalizedIndicators")}>
            <div className="table-responsive" style={{ maxHeight: 400, overflowY: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("crispdm.code")}</th><th>{t("crispdm.domain")}</th><th>{t("crispdm.inverted")}</th>
                    <th>{t("crispdm.rawWeight")}</th><th>{t("crispdm.normWeight")}</th>
                    <th>{t("crispdm.tracts")}</th><th>min</th><th>max</th><th>media</th>
                  </tr>
                </thead>
                <tbody>
                  {data.indicators.map((i: any) => (
                    <tr key={i.code}>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{i.code}</td>
                      <td>{i.domain}</td>
                      <td><span className={`badge ${i.inverted ? "blue" : "gray"}`}>{i.inverted ? "1 − x̃" : "x̃"}</span></td>
                      <td style={{ fontFamily: "var(--font-mono)" }}>{num(i.raw_weight, 3)}</td>
                      <td style={{ fontFamily: "var(--font-mono)" }}>{num(i.normalized_weight, 4)}</td>
                      <td>{i.tracts}</td>
                      <td style={{ fontFamily: "var(--font-mono)" }}>{num(i.min, 3)}</td>
                      <td style={{ fontFamily: "var(--font-mono)" }}>{num(i.max, 3)}</td>
                      <td style={{ fontFamily: "var(--font-mono)" }}>{num(i.mean, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}

      {/* Fase IV */}
      {activeKey === "modeling" && data && (
        <>
          <Section title={t("crispdm.technique")}>
            <p style={{ fontWeight: 600, fontSize: 15 }}>{data.technique}</p>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.6 }}>{data.rationale}</p>
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 14, fontFamily: "var(--font-mono)", fontSize: 13.5, display: "flex", flexDirection: "column", gap: 6 }}>
              <span>{data.formula.composite}</span>
              <span style={{ color: "var(--text-muted)" }}>{t("crispdm.protective")}: {data.formula.protective}</span>
              <span style={{ color: "var(--text-muted)" }}>{t("crispdm.risk")}: {data.formula.risk}</span>
              <span>{data.formula.vulnerability}</span>
            </div>
            <p style={{ color: "var(--text-dim)", fontSize: 12.5, marginBottom: 0 }}>{data.complexity}</p>
          </Section>
          <div className="grid grid-2">
            <Section title={t("crispdm.riskThresholds")}>
              <KeyValue items={data.risk_thresholds.map((r: any) => [r.level, `≥ P${r.min_percentile}`])} />
            </Section>
            <Section title={t("crispdm.assumptions")}>
              <Bullets items={data.assumptions} />
            </Section>
          </div>
          <Section title={t("crispdm.weights")}>
            <div className="table-responsive" style={{ maxHeight: 380, overflowY: "auto" }}>
              <table className="table">
                <thead>
                  <tr><th>{t("crispdm.code")}</th><th>{t("common.name")}</th><th>{t("crispdm.domain")}</th><th>{t("crispdm.direction")}</th><th>{t("crispdm.rawWeight")}</th><th>{t("crispdm.normWeight")}</th></tr>
                </thead>
                <tbody>
                  {data.weights.map((w: any) => (
                    <tr key={w.code}>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{w.code}</td>
                      <td>{w.name}</td>
                      <td>{w.domain}</td>
                      <td><span className={`badge ${w.direction === "riesgo" ? "red" : "green"}`}>{w.direction}</span></td>
                      <td style={{ fontFamily: "var(--font-mono)" }}>{num(w.raw, 3)}</td>
                      <td style={{ fontFamily: "var(--font-mono)" }}>{num(w.normalized, 4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <Section title={t("crispdm.companionModels")}>
            <Bullets items={data.companion_models.map((m: any) => `${m.name} — ${m.detail}${m.rules != null ? ` (${m.rules})` : ""}`)} />
          </Section>
        </>
      )}

      {/* Fase V */}
      {activeKey === "evaluation" && data && (
        <>
          {data.latency ? (
            <div className="grid grid-4" style={{ marginBottom: 22 }}>
              <StatCard label={t("crispdm.medianLatency")} value={`${num(data.latency.median_seconds, 4)} s`} subtext={`p95 ${num(data.latency.p95_seconds, 4)} s`} icon={<Gauge size={22} style={{ color: "#fb923c" }} />} />
              <StatCard label={t("crispdm.projected")} value={data.latency.projected_at_target_population != null ? `${num(data.latency.projected_at_target_population, 3)} s` : "—"} subtext={`${num(data.latency.target_population, 0)} hab.`} icon={<Target size={22} style={{ color: "#60a5fa" }} />} />
              <StatCard label="H3" value={data.latency.meets_h3 ? t("crispdm.met") : t("crispdm.notMet")} subtext={`< ${data.latency.target_seconds} s`} icon={data.latency.meets_h3 ? <CheckCircle2 size={22} style={{ color: "#10b981" }} /> : <XCircle size={22} style={{ color: "#ef4444" }} />} />
              <StatCard label={t("crispdm.stability")} value={data.sensitivity.risk_level_stability_pct != null ? `${num(data.sensitivity.risk_level_stability_pct)} %` : "—"} subtext={`ρ ${num(data.sensitivity.spearman_mean, 4)}`} icon={<ClipboardCheck size={22} style={{ color: "#a78bfa" }} />} />
            </div>
          ) : (
            <div className="card" style={{ marginBottom: 22 }}>
              <p style={{ margin: 0, color: "var(--text-muted)" }}>{t("crispdm.benchmarkHint")}</p>
            </div>
          )}

          <Section title={t("crispdm.criteria")}>
            {data.criteria ? (
              <div className="table-responsive">
                <table className="table">
                  <thead><tr><th>{t("crispdm.dimension")}</th><th>{t("crispdm.metric")}</th><th>{t("crispdm.hypothesis")}</th><th>{t("crispdm.target")}</th></tr></thead>
                  <tbody>
                    {data.criteria.map((c: any) => (
                      <tr key={c.metric}>
                        <td><b>{c.dimension}</b></td>
                        <td style={{ color: "var(--text-muted)" }}>{c.metric}</td>
                        <td style={{ fontFamily: "var(--font-mono)" }}>{c.hypothesis}</td>
                        <td>{c.target}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Bullets items={data.process_review ?? []} />
            )}
          </Section>

          {data.risk_distribution && Object.keys(data.risk_distribution).length > 0 && (
            <Section title={t("crispdm.riskDistribution")}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={Object.entries(data.risk_distribution).map(([k, v]) => ({ name: k, count: v as number }))} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={{ background: "var(--bg-surface)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 8 }} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {Object.keys(data.risk_distribution).map((k) => (
                      <Cell key={k} fill={RISK_COLORS[k] ?? "#64748b"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Section>
          )}

          {data.process_review && data.criteria && (
            <Section title={t("crispdm.processReview")}>
              <Bullets items={data.process_review} />
            </Section>
          )}
          {(data.limitations || data.note) && (
            <Section title={t("crispdm.limitations")}>
              <Bullets items={data.limitations ?? [data.note]} />
            </Section>
          )}
        </>
      )}

      {/* Fase VI */}
      {activeKey === "deployment" && data && (
        <>
          <div className="grid grid-4" style={{ marginBottom: 22 }}>
            <StatCard label={t("crispdm.auditEvents")} value={data.governance.audit_events} subtext={`${data.governance.users} ${t("crispdm.users")}`} icon={<ClipboardCheck size={22} style={{ color: "#a78bfa" }} />} />
            <StatCard label={t("crispdm.reports")} value={data.reports.total} subtext={Object.keys(data.reports.by_format).join(" · ") || "—"} icon={<Rocket size={22} style={{ color: "#f472b6" }} />} />
            <StatCard label={t("crispdm.openAlerts")} value={data.monitoring.alerts_open} subtext={`${data.monitoring.alert_rules} ${t("crispdm.rules")}`} icon={<Target size={22} style={{ color: "#fb923c" }} />} />
            <StatCard label={t("crispdm.rolesPerms")} value={`${data.governance.roles}/${data.governance.permissions}`} icon={<CheckCircle2 size={22} style={{ color: "#10b981" }} />} />
          </div>
          <Section title={t("crispdm.services")}>
            <div className="table-responsive">
              <table className="table">
                <thead><tr><th>{t("common.name")}</th><th>{t("common.description")}</th><th>Runtime</th><th>{t("common.status")}</th></tr></thead>
                <tbody>
                  {data.services.map((s: any) => (
                    <tr key={s.name}>
                      <td><b>{s.name}</b></td>
                      <td style={{ color: "var(--text-muted)" }}>{s.detail}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{s.runtime}</td>
                      <td><span className={`badge ${s.status === "running" || s.status === "connected" ? "green" : "gray"}`}>{s.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <div className="grid grid-2">
            <Section title={t("crispdm.feedbackLoop")}>
              <Bullets items={data.feedback_loop} />
            </Section>
            <Section title={t("crispdm.recentAudit")}>
              {data.recent_audit.length === 0 ? (
                <div className="empty-state">{t("crispdm.noAudit")}</div>
              ) : (
                <div className="table-responsive" style={{ maxHeight: 300, overflowY: "auto" }}>
                  <table className="table">
                    <thead><tr><th>{t("common.date")}</th><th>{t("crispdm.user")}</th><th>{t("crispdm.action")}</th><th>{t("common.description")}</th></tr></thead>
                    <tbody>
                      {data.recent_audit.map((a: any) => (
                        <tr key={a.id}>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>{a.created_at?.replace("T", " ").replace("Z", "")}</td>
                          <td>{a.username || "—"}</td>
                          <td><span className="badge blue">{a.action}</span></td>
                          <td style={{ color: "var(--text-muted)", fontSize: 12 }}>{a.detail || a.resource || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </div>
        </>
      )}
    </div>
  );
}
