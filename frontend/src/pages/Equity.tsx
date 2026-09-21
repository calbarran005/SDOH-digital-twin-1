import { useEffect, useMemo, useState } from "react";
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
import { Calculator, Scale, Sparkles } from "lucide-react";
import api from "../api/client";
import StatCard from "../components/StatCard";
import type { EquityIndex } from "../types";

export default function Equity() {
  const { t } = useTranslation();
  const [equity, setEquity] = useState<EquityIndex[]>([]);
  const [computing, setComputing] = useState(false);
  const [year, setYear] = useState(2023);
  const [filterRisk, setFilterRisk] = useState("");
  const [searchTract, setSearchTract] = useState("");
  const [selectedTract, setSelectedTract] = useState<EquityIndex | null>(null);

  const load = () => {
    api.get("/sdoh/equity?year=" + year).then((r) => setEquity(r.data)).catch(() => {});
  };
  useEffect(load, [year]);

  const compute = async () => {
    setComputing(true);
    try { await api.post(`/sdoh/equity/compute?year=${year}`); load(); } finally { setComputing(false); }
  };

  const summary = useMemo(() => {
    if (!equity.length) return { low: 0, moderate: 0, high: 0, critical: 0 };
    const s = { low: 0, moderate: 0, high: 0, critical: 0 };
    equity.forEach((e) => { const k = e.risk_level as keyof typeof s; if (s[k] !== undefined) s[k] = (s[k] || 0) + 1; });
    return s;
  }, [equity]);

  const byRisk = [
    { name: t("common.low"), count: summary.low, fill: "#10b981", key: "low" },
    { name: t("common.moderate"), count: summary.moderate, fill: "#f59e0b", key: "moderate" },
    { name: t("common.high"), count: summary.high, fill: "#f97316", key: "high" },
    { name: t("common.critical"), count: summary.critical, fill: "#ef4444", key: "critical" },
  ];

  const filteredEquity = useMemo(() => {
    let list = equity;
    if (filterRisk) list = list.filter((e) => e.risk_level === filterRisk);
    if (searchTract) {
      const q = searchTract.toLowerCase();
      list = list.filter((e) => (e.tract_geoid && e.tract_geoid.toLowerCase().includes(q)) || String(e.tract_id).includes(q));
    }
    return list;
  }, [equity, filterRisk, searchTract]);

  return (
    <div>
      <div className="topbar">
        <div className="page-title-group">
          <h2 className="page-title">{t("equity.title")}</h2>
          <p className="page-subtitle">{t("equity.subtitle")}</p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>{t("common.year")}:</span>
            <input className="input" type="number" value={year} style={{ width: 85 }} onChange={(e) => setYear(+e.target.value)} />
          </div>
          <button className="btn" onClick={compute} disabled={computing}>
            <Calculator size={16} />
            <span>{computing ? t("equity.computing") : t("equity.computeIndex")}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 22 }}>
        <StatCard label={`${t("common.low")}`} value={summary.low} icon={<Scale size={22} style={{ color: "#10b981" }} />} subtext="Mínima" />
        <StatCard label={`${t("common.moderate")}`} value={summary.moderate} icon={<Scale size={22} style={{ color: "#f59e0b" }} />} subtext="Preventivo" />
        <StatCard label={`${t("common.high")}`} value={summary.high} icon={<Scale size={22} style={{ color: "#f97316" }} />} subtext="Intervención" />
        <StatCard label={`${t("common.critical")}`} value={summary.critical} icon={<Scale size={22} style={{ color: "#ef4444" }} />} subtext="Urgente" />
      </div>

      <div className="grid grid-2" style={{ marginBottom: 22 }}>
        <div className="chart-card">
          <h3>{t("equity.riskDistribution")}</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byRisk} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="name" stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={{ background: "var(--bg-surface)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: "8px" }} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Tracts">
                {byRisk.map((r) => <Cell key={r.name} fill={r.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>
            <span>{t("dashboard.tractDetail")}</span>
            {selectedTract && <span className={`badge ${selectedTract.risk_level}`}>{selectedTract.risk_level}</span>}
          </h3>
          {selectedTract ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-main)" }}>
                Tract: <span style={{ color: "#60a5fa" }}>{selectedTract.tract_geoid || `Tract ${selectedTract.tract_id}`}</span>
              </div>
              <div className="grid grid-2">
                <div className="card" style={{ padding: 14 }}>
                  <div className="stat-label">{t("equity.value")}</div>
                  <div className="stat-value" style={{ fontSize: 22, color: "#60a5fa" }}>{selectedTract.value?.toFixed(3)}</div>
                </div>
                <div className="card" style={{ padding: 14 }}>
                  <div className="stat-label">{t("equity.percentile")}</div>
                  <div className="stat-value" style={{ fontSize: 22, color: "#f59e0b" }}>{selectedTract.percentile?.toFixed(1)}%</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <Sparkles size={28} style={{ color: "#3b82f6", opacity: 0.7 }} />
              <div>Selecciona un tract de la tabla inferior.</div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <h3 style={{ margin: 0 }}>{t("equity.equityTable")} ({filteredEquity.length})</h3>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input className="input" style={{ width: 180 }} value={searchTract} onChange={(e) => setSearchTract(e.target.value)} placeholder={`${t("equity.geoid")}…`} />
            <select className="select" style={{ width: 150 }} value={filterRisk} onChange={(e) => setFilterRisk(e.target.value)}>
              <option value="">{t("common.all")}</option>
              <option value="low">{t("common.low")}</option>
              <option value="moderate">{t("common.moderate")}</option>
              <option value="high">{t("common.high")}</option>
              <option value="critical">{t("common.critical")}</option>
            </select>
          </div>
        </div>
        {filteredEquity.length === 0 ? (
          <div className="empty-state">{t("equity.noTracts")}</div>
        ) : (
          <div className="table-responsive" style={{ maxHeight: 380, overflowY: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>GEOID</th>
                  <th>{t("equity.value")}</th>
                  <th>{t("equity.percentile")}</th>
                  <th>{t("equity.riskLevel")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredEquity.map((e) => (
                  <tr key={e.id} style={{ cursor: "pointer", background: selectedTract?.id === e.id ? "rgba(59, 130, 246, 0.12)" : undefined }} onClick={() => setSelectedTract(e)}>
                    <td><b>{e.tract_geoid || `Tract ${e.tract_id}`}</b></td>
                    <td style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{e.value?.toFixed(3)}</td>
                    <td><span style={{ fontFamily: "var(--font-mono)" }}>{e.percentile?.toFixed(1)}%</span></td>
                    <td><span className={`badge ${e.risk_level}`}>{e.risk_level}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
