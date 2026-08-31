import { useEffect, useMemo, useState } from "react";
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
import { Calculator, Scale } from "lucide-react";
import api from "../api/client";
import StatCard from "../components/StatCard";
import type { EquityIndex } from "../types";

function riskColor(level?: string) {
  return level === "critical" ? "#ef4444" : level === "high" ? "#f97316" : level === "moderate" ? "#f59e0b" : "#22c55e";
}

export default function Equity() {
  const [equity, setEquity] = useState<EquityIndex[]>([]);
  const [computing, setComputing] = useState(false);
  const [year, setYear] = useState(2022);
  const [title, setTitle] = useState("");

  const load = () => {
    api.get("/sdoh/equity?year=" + year).then((r) => setEquity(r.data)).catch(() => {});
  };

  useEffect(load, [year]);

  const compute = async () => {
    setComputing(true);
    try {
      await api.post(`/sdoh/equity/compute?year=${year}`);
      load();
    } finally {
      setComputing(false);
    }
  };

  const summary = useMemo(() => {
    if (!equity.length) return { low: 0, moderate: 0, high: 0, critical: 0 };
    const s = { low: 0, moderate: 0, high: 0, critical: 0 };
    equity.forEach((e) => {
      const k = e.risk_level as keyof typeof s;
      s[k] = (s[k] || 0) + 1;
    });
    return s;
  }, [equity]);

  const byRisk = [
    { name: "low", count: summary.low, fill: "#22c55e" },
    { name: "moderate", count: summary.moderate, fill: "#f59e0b" },
    { name: "high", count: summary.high, fill: "#f97316" },
    { name: "critical", count: summary.critical, fill: "#ef4444" },
  ];

  const handleSelect = (e: EquityIndex) => {
    setTitle(`${e.tract_geoid || e.tract_id} — riesgo ${e.risk_level} · índice ${e.value?.toFixed(3)}`);
  };

  return (
    <div>
      <div className="topbar">
        <h2 className="page-title">Equidad en Salud</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            className="input"
            type="number"
            value={year}
            style={{ width: 90 }}
            onChange={(e) => setYear(+e.target.value)}
          />
          <button className="btn" onClick={compute} disabled={computing}>
            <Calculator size={15} /> {computing ? "Calculando…" : "Recalcular índices"}
          </button>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 18 }}>
        {(["low", "moderate", "high", "critical"] as const).map((k) => (
          <StatCard
            key={k}
            label={`Tracts ${k}`}
            value={summary[k]}
            icon={<Scale size={20} style={{ color: riskColor(k) }} />}
          />
        ))}
      </div>

      <div className="grid grid-2">
        <div className="chart-card">
          <h3>Distribución por nivel de riesgo</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byRisk}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="name" stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip contentStyle={{ background: "#10182d", border: "1px solid #1e293b" }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {byRisk.map((r) => (
                  <Cell key={r.name} fill={r.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <h3>Índices de equidad por tract</h3>
          <span className="text-muted">{title || "Haga clic en un tract de la lista"}</span>
          {equity.length === 0 ? (
            <div className="empty-state">Sin datos — ejecute el cálculo</div>
          ) : (
            <div style={{ maxHeight: 280, overflowY: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Tract</th>
                    <th>Índice</th>
                    <th>Percentil</th>
                    <th>Riesgo</th>
                  </tr>
                </thead>
                <tbody>
                  {equity.slice(0, 50).map((e) => (
                    <tr key={e.id} style={{ cursor: "pointer" }} onClick={() => handleSelect(e)}>
                      <td>{e.tract_geoid || e.tract_id}</td>
                      <td>{e.value?.toFixed(3)}</td>
                      <td>{e.percentile?.toFixed(1)}%</td>
                      <td>
                        <span className={`badge ${e.risk_level}`}>{e.risk_level}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
