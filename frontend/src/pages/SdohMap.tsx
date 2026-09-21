import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Database, Layers, Sparkles } from "lucide-react";
import api from "../api/client";
import StatCard from "../components/StatCard";

interface ValueRow {
  catalog_code: string;
  catalog_name: string;
  domain?: string;
  value: number;
  year: number;
}

const PIE_COLORS = ["#3b82f6", "#06b6d4", "#8b5cf6", "#10b981", "#f59e0b", "#ec4899", "#6366f1"];

export default function SdohMap() {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<any[]>([]);
  const [values, setValues] = useState<ValueRow[]>([]);
  const [filterDomain, setFilterDomain] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    api.get("/sdoh/catalog").then((r) => setCatalog(r.data)).catch(() => {});
    api.get("/sdoh/values?year=2023&limit=2000").then((r) => setValues(r.data)).catch(() => {});
  }, []);

  const domains = useMemo(() => {
    const map = new Map<string, number>();
    catalog.forEach((c) => c.domain && map.set(c.domain, (map.get(c.domain) || 0) + 1));
    return Array.from(map.entries()).map(([name, count]) => ({ name, count, value: count }));
  }, [catalog]);

  const filtered = useMemo(() => {
    let list = values;
    if (filterDomain) {
      const codes = new Set(catalog.filter((c) => c.domain === filterDomain).map((c) => c.code));
      list = list.filter((v) => codes.has(v.catalog_code));
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((v) => v.catalog_name.toLowerCase().includes(q) || v.catalog_code.toLowerCase().includes(q));
    }
    return list;
  }, [values, filterDomain, searchQuery, catalog]);

  const avgByIndicator = useMemo(() => {
    const map = new Map<string, { sum: number; n: number; name: string; domain?: string }>();
    filtered.forEach((v) => {
      const cur = map.get(v.catalog_code) || { sum: 0, n: 0, name: v.catalog_name, domain: v.domain };
      cur.sum += v.value;
      cur.n += 1;
      map.set(v.catalog_code, cur);
    });
    return Array.from(map.entries())
      .map(([code, d]) => ({ code, name: d.name, domain: d.domain, avg: +(d.sum / d.n).toFixed(2), records: d.n }))
      .sort((a, b) => b.avg - a.avg);
  }, [filtered]);

  return (
    <div>
      <div className="topbar">
        <div className="page-title-group">
          <h2 className="page-title">{t("sdohMap.title")}</h2>
          <p className="page-subtitle">{t("sdohMap.subtitle")}</p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ position: "relative", width: 220 }}>
            <input className="input" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={`${t("common.search")}…`} />
          </div>
          <div style={{ width: 200 }}>
            <select className="select" value={filterDomain} onChange={(e) => setFilterDomain(e.target.value)}>
              <option value="">{t("sdohMap.allDomains")} ({catalog.length})</option>
              {domains.map((d) => (
                <option key={d.name} value={d.name}>{d.name} ({d.count})</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <StatCard label="Total Indicadores" value={catalog.length} icon={<Layers size={22} />} subtext="CDC PLACES & ACS" />
        <StatCard label={t("sdohMap.domain") + "s SDOH"} value={domains.length} icon={<Sparkles size={22} />} subtext="Determinantes sociales" />
        <StatCard label="Registros" value={filtered.length} icon={<Database size={22} />} subtext="Observaciones (2022)" />
      </div>

      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <div className="chart-card">
          <h3>{t("sdohMap.pieChart")}</h3>
          <ResponsiveContainer width="100%" height={290}>
            <PieChart>
              <Pie data={domains} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={4}
                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                {domains.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "var(--bg-surface)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: "8px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card" style={{ gridColumn: "span 2" }}>
          <h3>
            <span>{t("sdohMap.avgByIndicator")} {filterDomain ? `· ${filterDomain}` : ""}</span>
            <span className="badge blue">{avgByIndicator.length}</span>
          </h3>
          {avgByIndicator.length === 0 ? (
            <div className="empty-state">{t("sdohMap.noData")}</div>
          ) : (
            <div className="table-responsive" style={{ maxHeight: 310, overflowY: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("common.name")}</th>
                    <th style={{ width: 140 }}>{t("sdohMap.average")}</th>
                    <th style={{ width: 100 }}>Muestras</th>
                  </tr>
                </thead>
                <tbody>
                  {avgByIndicator.map((r) => (
                    <tr key={r.code}>
                      <td>
                        <div style={{ fontWeight: 600, color: "var(--text-main)" }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{r.code}</div>
                      </td>
                      <td><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{r.avg}</span></td>
                      <td style={{ color: "var(--text-dim)", fontSize: 12 }}>{r.records} tracts</td>
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
