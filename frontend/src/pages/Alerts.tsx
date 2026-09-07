import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Zap, ShieldAlert, CheckCircle, BellRing, Sliders } from "lucide-react";
import api from "../api/client";
import StatCard from "../components/StatCard";
import type { Alert } from "../types";

export default function Alerts() {
  const { t } = useTranslation();
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
    try { await api.post("/sdoh/alerts/generate"); load(); } finally { setGenerating(false); }
  };

  const openCount = alerts.filter((a) => a.status === "open").length;
  const criticalCount = alerts.filter((a) => a.severity === "critical").length;

  return (
    <div>
      <div className="topbar">
        <div className="page-title-group">
          <h2 className="page-title">{t("alerts.title")}</h2>
          <p className="page-subtitle">{t("alerts.subtitle")}</p>
        </div>
        <button className="btn" onClick={generate} disabled={generating}>
          <Zap size={16} />
          <span>{generating ? "…" : t("alerts.addRule")}</span>
        </button>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 22 }}>
        <StatCard label="Total Alertas" value={alerts.length} icon={<BellRing size={22} />} subtext="Historial" />
        <StatCard label={t("dashboard.openAlerts")} value={openCount} icon={<AlertTriangle size={22} style={{ color: "#f59e0b" }} />} subtext="Pendientes" />
        <StatCard label="Críticas" value={criticalCount} icon={<ShieldAlert size={22} style={{ color: "#ef4444" }} />} subtext="Umbrales extremos" />
      </div>

      <div className="card" style={{ marginBottom: 22 }}>
        <h3 style={{ marginTop: 0 }}><Sliders size={18} style={{ color: "#60a5fa" }} />{t("alerts.alertRules")}</h3>
        {rules.length === 0 ? (
          <div className="text-muted" style={{ fontSize: 13.5 }}>No hay reglas personalizadas activas.</div>
        ) : (
          <div className="grid grid-3">
            {rules.map((r) => (
              <div key={r.id} className="card" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", padding: 14 }}>
                <div style={{ fontWeight: 600, color: "var(--text-main)", marginBottom: 4 }}>{r.name}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>{r.indicator_code} {r.comparison} {r.threshold}</span>
                  <span className={`badge ${r.severity}`}>{r.severity}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <h3 style={{ margin: 0 }}>{t("alerts.alertHistory")}</h3>
          <div style={{ display: "flex", gap: 8 }}>
            {[{ val: "", label: t("alerts.allStatus") }, { val: "open", label: t("common.open") }, { val: "acknowledged", label: "Reconocida" }, { val: "resolved", label: t("common.closed") }].map((tab) => (
              <button key={tab.val} className={`btn btn-sm ${status === tab.val ? "" : "secondary"}`} onClick={() => setStatus(tab.val)}>{tab.label}</button>
            ))}
          </div>
        </div>
        {alerts.length === 0 ? (
          <div className="empty-state"><CheckCircle size={32} style={{ color: "#10b981", opacity: 0.7 }} /><div>{t("alerts.noAlerts")}</div></div>
        ) : (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr><th>{t("alerts.indicator")}</th><th>{t("alerts.severity")}</th><th>Valor</th><th>{t("common.status")}</th><th>Diagnóstico</th></tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: "var(--text-main)" }}>{a.indicator_name || a.indicator_code}</div>
                      <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>Tract: {a.tract_id}</div>
                    </td>
                    <td><span className={`badge ${a.severity}`}>{a.severity}</span></td>
                    <td style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{a.observed_value}</td>
                    <td><span className={`badge ${a.status === "open" ? "red" : a.status === "resolved" ? "green" : "gray"}`}>
                      {a.status === "open" ? t("common.open") : a.status === "resolved" ? t("common.closed") : "Reconocida"}
                    </span></td>
                    <td className="text-muted" style={{ fontSize: 12.5 }}>{a.message}</td>
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
