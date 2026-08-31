import { useEffect, useMemo, useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import api from "../api/client";

interface ValueRow {
  catalog_code: string;
  catalog_name: string;
  domain?: string;
  value: number;
  year: number;
}

export default function SdohMap() {
  const [catalog, setCatalog] = useState<any[]>([]);
  const [values, setValues] = useState<ValueRow[]>([]);
  const [filterDomain, setFilterDomain] = useState("");

  useEffect(() => {
    api.get("/sdoh/catalog").then((r) => setCatalog(r.data)).catch(() => {});
    api.get("/sdoh/values?year=2022&limit=2000").then((r) => setValues(r.data)).catch(() => {});
  }, []);

  const domains = useMemo(() => {
    const map = new Map<string, number>();
    catalog.forEach((c) => c.domain && map.set(c.domain, (map.get(c.domain) || 0) + 1));
    return Array.from(map.entries()).map(([name, count]) => ({ name, count, value: count }));
  }, [catalog]);

  const filtered = useMemo(() => {
    if (!filterDomain) return values;
    const codes = new Set(
      catalog.filter((c) => c.domain === filterDomain).map((c) => c.code)
    );
    return values.filter((v) => codes.has(v.catalog_code));
  }, [values, filterDomain, catalog]);

  const avgByIndicator = useMemo(() => {
    const map = new Map<string, { sum: number; n: number; name: string }>();
    filtered.forEach((v) => {
      const cur = map.get(v.catalog_code) || { sum: 0, n: 0, name: v.catalog_name };
      cur.sum += v.value;
      cur.n += 1;
      map.set(v.catalog_code, cur);
    });
    return Array.from(map.entries())
      .map(([code, d]) => ({ code, name: d.name, avg: +(d.sum / d.n).toFixed(2) }))
      .sort((a, b) => b.avg - a.avg);
  }, [filtered]);

  return (
    <div>
      <div className="topbar">
        <h2 className="page-title">Mapa SDOH · Indicadores</h2>
        <div className="field" style={{ margin: 0, width: 260 }}>
          <select
            className="select"
            value={filterDomain}
            onChange={(e) => setFilterDomain(e.target.value)}
          >
            <option value="">Todos los dominios</option>
            {domains.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name} ({d.count})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 18 }}>
        <div className="chart-card">
          <h3>Dominios SDOH disponibles</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={domains}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={90}
                fill="#3b82f6"
                label
              />
              <Tooltip contentStyle={{ background: "#10182d", border: "1px solid #1e293b" }} />
              <Cell fill="#3b82f6" />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card" style={{ gridColumn: "span 2" }}>
          <h3>Promedio por indicador ({filterDomain || "todos"})</h3>
          {avgByIndicator.length === 0 ? (
            <div className="empty-state">Sin datos</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Indicador</th>
                  <th style={{ width: 90 }}>Promedio</th>
                </tr>
              </thead>
              <tbody>
                {avgByIndicator.slice(0, 12).map((r) => (
                  <tr key={r.code}>
                    <td>{r.name}</td>
                    <td>{r.avg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <div className="stat-label" style={{ marginBottom: 10 }}>
          Registros de valores SDOH cargados
        </div>
        <div className="stat-value">{filtered.length}</div>
        <hr className="divider" />
        <p className="text-muted" style={{ fontSize: 13 }}>
          Fuentes: CDC PLACES y Census ACS (American Community Survey). Use el módulo ETL
          del backend para importar datasets públicos completos.
        </p>
      </div>
    </div>
  );
}
