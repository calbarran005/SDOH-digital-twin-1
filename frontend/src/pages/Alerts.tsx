import { useEffect, useState } from "react";
import { AlertTriangle, Zap } from "lucide-react";
import api from "../api/client";
import StatCard from "../components/StatCard";
import type { Alert } from "../types";

export default function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [status, setStatus] = useState("");
  const [generating, setGenerating] = useState(false);

  const load = () => {
    const q = status ? `?status=${status}` : "";
    api.get(`/sdoh/alerts${q}`).then((r) => setAlerts(r.data)).catch(() => {});
    api.get("/sdoh/alert-rules").then((r) => setRules(r.data)).catch(() => {});
  };

  useEffect(load, [status]);

  const generate = async () => {
    setGenerating(true);
    try {
      await api.post("/sdoh/alerts/generate");
      load();
    } finally {
      setGenerating(false);
    }
  };

  const openCount = alerts.filter((a) => a.status === "open").length;
  const critical = alerts.filter((a) => a.severity === "critical").length;

  return (
    <div>
      <div className="topbar">
        <h2 className="page-title">Alertas de equidad</h2>
        <button className="btn" onClick={generate} disabled={generating}>
          <Zap size={15} /> {generating ? "Generando…" : "Generar alertas"}
        </button>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 18 }}>
        <StatCard label="Total" value={alerts.length} icon={<AlertTriangle size={20} />} />
        <StatCard label="Abiertas" value={openCount} icon={<AlertTriangle size={20} />} />
        <StatCard label="Críticas" value={critical} icon={<AlertTriangle size={20} style={{ color: "#ef4444" }} />} />
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <h3 style={{ marginTop: 0 }}>Reglas de alerta</h3>
        <div className="grid grid-3" style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {rules.length === 0 ? (
            <div className="text-muted">Sin reglas — créelas vía API</div>
          ) : (
            rules.map((r) => (
              <div key={r.id} className="card" style={{ flex: "1 1 200px", padding: 12 }}>
                <b>{r.name}</b>
                <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {r.comparison} {r.threshold} · {r.severity}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Historial de alertas</h3>
          <select className="select" style={{ width: 140 }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todas</option>
            <option value="open">Abiertas</option>
            <option value="acknowledged">Reconocidas</option>
            <option value="resolved">Resueltas</option>
          </select>
        </div>
        {alerts.length === 0 ? (
          <div className="empty-state">Sin alertas</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Indicador</th>
                <th>Severidad</th>
                <th>Valor</th>
                <th>Estado</th>
                <th>Mensaje</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id}>
                  <td>{a.indicator_name || a.indicator_code}</td>
                  <td>
                    <span className={`badge ${a.severity}`}>{a.severity}</span>
                  </td>
                  <td>{a.observed_value}</td>
                  <td>
                    <span className={`badge ${a.status === "open" ? "red" : "gray"}`}>{a.status}</span>
                  </td>
                  <td className="text-muted">{a.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
