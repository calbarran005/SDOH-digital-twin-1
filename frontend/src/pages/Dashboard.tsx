import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  AlertTriangle,
  Building2,
  MapPin,
  Scale,
  Sparkles,
  Layers,
} from "lucide-react";
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
import api from "../api/client";
import StatCard from "../components/StatCard";
import Twin3D, { TwinCell } from "../components/Twin3D";
import type { Alert, EquityIndex } from "../types";

interface CellInfo {
  tract_geoid?: string;
  value: number;
  risk_level?: string;
  percentile?: number;
}

const RISK_COLORS: Record<string, string> = {
  low: "#10b981",
  moderate: "#f59e0b",
  high: "#f97316",
  critical: "#ef4444",
};

export default function Dashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<any>(null);
  const [equity, setEquity] = useState<EquityIndex[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [colorBy, setColorBy] = useState<"value" | "risk">("risk");
  const [selected, setSelected] = useState<TwinCell | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<CellInfo | null>(null);

  useEffect(() => {
    api.get("/geo/health-system/stats").then((r) => setStats(r.data)).catch(() => {});
    api.get(`/sdoh/equity?year=2022`).then((r) => setEquity(r.data)).catch(() => {});
    api.get("/sdoh/alerts?limit=6").then((r) => setAlerts(r.data)).catch(() => {});
  }, []);

  const cells: TwinCell[] = useMemo(() => {
    if (!equity.length) return [];
    const sorted = [...equity].sort((a, b) => (a.percentile ?? 0) - (b.percentile ?? 0));
    const gridCols = Math.ceil(Math.sqrt(sorted.length)) || 1;
    const spacing = 1.35;
    return sorted.map((e, i) => {
      const col = i % gridCols;
      const row = Math.floor(i / gridCols);
      return {
        id: String(e.tract_id),
        x: col * spacing,
        z: row * spacing,
        label: e.tract_geoid ? `Tract ${e.tract_geoid.slice(-4)}` : `Tract ${e.tract_id}`,
        name: e.tract_geoid || undefined,
        value: e.value || 0,
        risk: e.risk_level || "low",
      };
    });
  }, [equity]);

  const riskCounts = useMemo(() => {
    const counts: Record<string, number> = { low: 0, moderate: 0, high: 0, critical: 0 };
    equity.forEach((e) => {
      const k = e.risk_level || "low";
      counts[k] = (counts[k] || 0) + 1;
    });
    return [
      { name: t("common.low"), key: "low", count: counts.low, fill: RISK_COLORS.low },
      { name: t("common.moderate"), key: "moderate", count: counts.moderate, fill: RISK_COLORS.moderate },
      { name: t("common.high"), key: "high", count: counts.high, fill: RISK_COLORS.high },
      { name: t("common.critical"), key: "critical", count: counts.critical, fill: RISK_COLORS.critical },
    ];
  }, [equity, t]);

  const handleSelect = (cell: TwinCell) => {
    setSelected(cell);
    const eq = equity.find((e) => String(e.tract_id) === cell.id);
    if (eq) {
      setSelectedDetail({
        tract_geoid: eq.tract_geoid,
        value: eq.value,
        risk_level: eq.risk_level,
        percentile: eq.percentile,
      });
    }
  };

  return (
    <div>
      <div className="topbar">
        <div className="page-title-group">
          <h2 className="page-title">{t("dashboard.title")}</h2>
          <p className="page-subtitle">{t("dashboard.subtitle")}</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            className={`btn btn-sm ${colorBy === "risk" ? "" : "secondary"}`}
            onClick={() => setColorBy("risk")}
          >
            <Sparkles size={14} />
            <span>{t("dashboard.byRisk")}</span>
          </button>
          <button
            className={`btn btn-sm ${colorBy === "value" ? "" : "secondary"}`}
            onClick={() => setColorBy("value")}
          >
            <Layers size={14} />
            <span>{t("dashboard.byEquity")}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 22 }}>
        <StatCard
          label={t("dashboard.registeredHospitals")}
          value={stats?.hospitals ?? "—"}
          icon={<Building2 size={22} />}
          subtext={t("dashboard.hospitalsSubtext")}
        />
        <StatCard
          label={t("dashboard.censusTracts")}
          value={stats?.tracts ?? "—"}
          icon={<MapPin size={22} />}
          subtext={t("dashboard.tractsSubtext")}
        />
        <StatCard
          label={t("dashboard.catchmentAreas")}
          value={stats?.catchments ?? "—"}
          icon={<Activity size={22} />}
          subtext={t("dashboard.catchmentSubtext")}
        />
        <StatCard
          label={t("dashboard.openAlerts")}
          value={alerts.filter((a) => a.status === "open").length}
          icon={<AlertTriangle size={22} style={{ color: "#f87171" }} />}
          subtext={t("dashboard.alertsSubtext")}
        />
      </div>

      <div className="card" style={{ marginBottom: 22, padding: 0, overflow: "hidden" }}>
        <Twin3D cells={cells} colorBy={colorBy} onSelect={handleSelect} />
      </div>

      {selectedDetail && selected && (
        <div
          className="card"
          style={{
            marginBottom: 22,
            borderColor: "var(--border-card)",
            background: "var(--bg-surface-elevated)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: RISK_COLORS[selectedDetail.risk_level || "low"],
                  boxShadow: `0 0 10px ${RISK_COLORS[selectedDetail.risk_level || "low"]}`,
                }}
              />
              <h3 style={{ margin: 0, fontSize: 16 }}>
                {t("dashboard.tractDetail")}: <span style={{ color: "#60a5fa" }}>{selectedDetail.tract_geoid || selected.id}</span>
              </h3>
            </div>
            <button
              className="btn btn-sm secondary"
              onClick={() => { setSelected(null); setSelectedDetail(null); }}
            >
              {t("dashboard.closeInspector")}
            </button>
          </div>

          <div className="grid grid-3">
            <StatCard
              label={t("dashboard.equityIndex")}
              value={selectedDetail.value != null ? selectedDetail.value.toFixed(3) : "—"}
              icon={<Scale size={20} />}
              subtext={t("dashboard.equitySubtext")}
            />
            <StatCard
              label={t("dashboard.percentile")}
              value={selectedDetail.percentile != null ? `${selectedDetail.percentile.toFixed(1)}%` : "—"}
              icon={<Activity size={20} />}
              subtext={t("dashboard.percentileSubtext")}
            />
            <div className="card">
              <div className="stat-label">{t("dashboard.riskClassification")}</div>
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
                <span className={`badge ${selectedDetail.risk_level}`}>{selectedDetail.risk_level}</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("dashboard.riskPriority")}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-2">
        <div className="chart-card">
          <h3>
            <span>{t("dashboard.riskDistribution")}</span>
            <span style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 400 }}>{t("dashboard.year2022")}</span>
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={riskCounts} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 12 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 12 }} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                contentStyle={{
                  background: "var(--bg-surface)",
                  border: "1px solid rgba(59,130,246,0.3)",
                  borderRadius: "8px",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                }}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} name={t("dashboard.censusTractsLabel")}>
                {riskCounts.map((entry) => (
                  <Cell key={entry.key} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>
            <span>{t("dashboard.recentAlerts")}</span>
            <span className="badge red" style={{ fontSize: 11 }}>
              {alerts.length} {t("dashboard.notifications")}
            </span>
          </h3>
          {alerts.length === 0 ? (
            <div className="empty-state">{t("dashboard.noAlerts")}</div>
          ) : (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("dashboard.sdohIndicator")}</th>
                    <th>{t("dashboard.severity")}</th>
                    <th>{t("dashboard.value")}</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: "var(--text-main)" }}>
                          {a.indicator_name || a.indicator_code}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{a.message}</div>
                      </td>
                      <td><span className={`badge ${a.severity}`}>{a.severity}</span></td>
                      <td style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{a.observed_value}</td>
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
