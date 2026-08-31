import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Building2,
  MapPin,
  Scale,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [equity, setEquity] = useState<EquityIndex[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [colorBy, setColorBy] = useState<"value" | "risk">("risk");
  const [selected, setSelected] = useState<TwinCell | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<CellInfo | null>(null);

  useEffect(() => {
    api.get("/geo/health-system/stats").then((r) => setStats(r.data)).catch(() => {});
    api
      .get(`/sdoh/equity?year=2022`)
      .then((r) => setEquity(r.data))
      .catch(() => {});
    api.get("/sdoh/alerts?limit=6").then((r) => setAlerts(r.data)).catch(() => {});
  }, []);

  const cells: TwinCell[] = useMemo(() => {
    // Build a grid from equity data
    const sorted = [...equity].sort((a, b) => a.percentile! - b.percentile!);
    const gridCols = Math.ceil(Math.sqrt(sorted.length)) || 1;
    return sorted.map((e, i) => {
      const x = i % gridCols;
      const z = Math.floor(i / gridCols);
      return {
        id: String(e.tract_id),
        x: x * 1.4,
        z: z * 1.4,
        label: e.tract_geoid || `Tract ${e.tract_id}`,
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
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }, [equity]);

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
        <h2 className="page-title">Dashboard · Gemelo Digital 3D</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className={`btn btn-sm ${colorBy === "risk" ? "" : "secondary"}`}
            onClick={() => setColorBy("risk")}
          >
            Por riesgo
          </button>
          <button
            className={`btn btn-sm ${colorBy === "value" ? "" : "secondary"}`}
            onClick={() => setColorBy("value")}
          >
            Por índice
          </button>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 18 }}>
        <StatCard
          label="Hospitales"
          value={stats?.hospitals ?? "—"}
          icon={<Building2 size={20} />}
        />
        <StatCard
          label="Census Tracts"
          value={stats?.tracts ?? "—"}
          icon={<MapPin size={20} />}
        />
        <StatCard
          label="Áreas de captación"
          value={stats?.catchments ?? "—"}
          icon={<Activity size={20} />}
        />
        <StatCard
          label="Alertas abiertas"
          value={alerts.filter((a) => a.status === "open").length}
          icon={<AlertTriangle size={20} />}
        />
      </div>

      <div className="chart-card" style={{ marginBottom: 18, padding: 0 }}>
        <Twin3D cells={cells} colorBy={colorBy} onSelect={handleSelect} />
      </div>

      {selectedDetail && selected && (
        <div className="chart-card" style={{ marginBottom: 18 }}>
          <h3>
            Tract seleccionado: <span style={{ color: "#3b82f6" }}>{selectedDetail.tract_geoid}</span>
          </h3>
          <div className="grid grid-3">
            <StatCard label="Índice de equidad" value={selectedDetail.value?.toFixed(3)} icon={<Scale size={20} />} />
            <StatCard
              label="Percentil de vulnerabilidad"
              value={`${selectedDetail.percentile?.toFixed(1)}%`}
              icon={<Scale size={20} />}
            />
            <div className="card">
              <div className="stat-label">Nivel de riesgo</div>
              <div style={{ marginTop: 10 }}>
                <span className={`badge ${selectedDetail.risk_level}`}>
                  {selectedDetail.risk_level}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-2">
        <div className="chart-card">
          <h3>Distribución de riesgo por tract</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={riskCounts}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="name" stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip contentStyle={{ background: "#10182d", border: "1px solid #1e293b" }} />
              <Legend />
              <Bar dataKey="count" fill="#3b82f6" name="Tracts" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <h3>Alertas recientes</h3>
          {alerts.length === 0 ? (
            <div className="empty-state">Sin alertas</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Indicador</th>
                  <th>Severidad</th>
                  <th>Valor</th>
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
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
