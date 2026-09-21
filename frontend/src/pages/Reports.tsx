import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, FileText, FileSpreadsheet, FileType, Loader, Sparkles } from "lucide-react";
import api from "../api/client";

interface Report { id: number; title: string; report_type: string; format: string; status: string; filename?: string; created_at?: string; error?: string; }
interface Hospital { id: number; name: string; }

const FORMATS = [
  { value: "pdf", key: "reports.pdf", icon: FileText, desc: "Documento estilizado con gráficos" },
  { value: "word", key: "reports.word", icon: FileType, desc: "Reporte editable con tablas" },
  { value: "excel", key: "reports.excel", icon: FileSpreadsheet, desc: "Libro con Resumen y Detalle" },
  { value: "csv", key: "reports.csv", icon: FileType, desc: "Datos tabulares para BI" },
];

export default function Reports() {
  const { t } = useTranslation();
  const [reports, setReports] = useState<Report[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [title, setTitle] = useState("Reporte de Equidad SDOH");
  const [hospitalId, setHospitalId] = useState<number | null>(null);
  const [year, setYear] = useState(2023);
  const [format, setFormat] = useState("pdf");
  const [generating, setGenerating] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const load = () => { api.get("/reports").then((r) => setReports(r.data)).catch(() => {}); };
  useEffect(() => {
    load();
    api.get("/hospitals").then((r) => { setHospitals(r.data); if (r.data.length > 0) setHospitalId(r.data[0].id); }).catch(() => {});
  }, []);

  const generate = async () => {
    if (!hospitalId) return;
    setGenerating(true);
    try {
      await api.post("/reports/generate", { title, report_type: "catchment_equity", format, hospital_id: hospitalId, year, domains: null });
      load();
    } catch (e: any) { alert(e?.response?.data?.detail || "Error"); } finally { setGenerating(false); }
  };

  const download = async (id: number, filename?: string) => {
    setDownloadingId(id);
    try {
      const response = await api.get(`/reports/download/${id}`, { responseType: "blob" });
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename || `Reporte_SDOH_${id}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch { alert("Error al descargar"); } finally { setDownloadingId(null); }
  };

  return (
    <div>
      <div className="topbar">
        <div className="page-title-group">
          <h2 className="page-title">{t("reports.title")}</h2>
          <p className="page-subtitle">{t("reports.subtitle")}</p>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 22 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}><Sparkles size={18} style={{ color: "#60a5fa" }} />{t("reports.generate")}</h3>
          <div className="field">
            <label>{t("common.name")}</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-2">
            <div className="field">
              <label>Hospital</label>
              <select className="select" value={hospitalId ?? ""} onChange={(e) => setHospitalId(e.target.value ? +e.target.value : null)}>
                <option value="">-- Seleccionar --</option>
                {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>{t("common.year")}</label>
              <input className="input" type="number" value={year} onChange={(e) => setYear(+e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>{t("reports.format")}</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
              {FORMATS.map((f) => {
                const isSel = format === f.value;
                return (
                  <div key={f.value} onClick={() => setFormat(f.value)} style={{ cursor: "pointer", padding: 12, borderRadius: "var(--radius-sm)", background: isSel ? "rgba(59, 130, 246, 0.15)" : "var(--bg-surface)", border: isSel ? "1px solid #3b82f6" : "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: isSel ? "#60a5fa" : "var(--text-main)" }}>
                      <f.icon size={16} /><span>{t(f.key)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>{f.desc}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <button className="btn" style={{ width: "100%", marginTop: 8 }} onClick={generate} disabled={generating || !hospitalId}>
            {generating ? <Loader size={16} className="spin-icon" /> : <FileText size={16} />}
            <span>{generating ? t("reports.generating") : t("reports.generate")}</span>
          </button>
        </div>

        <div className="chart-card">
          <h3>
            <span>{t("reports.reportHistory")}</span>
            <span className="badge blue">{reports.length}</span>
          </h3>
          {reports.length === 0 ? (
            <div className="empty-state"><FileText size={32} style={{ color: "#3b82f6", opacity: 0.6 }} /><div>{t("reports.noReports")}</div></div>
          ) : (
            <div className="table-responsive" style={{ maxHeight: 420, overflowY: "auto" }}>
              <table className="table">
                <thead><tr><th>{t("common.name")}</th><th>{t("reports.format")}</th><th>{t("common.status")}</th><th style={{ textAlign: "right" }}>{t("reports.download")}</th></tr></thead>
                <tbody>
                  {reports.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: "var(--text-main)" }}>{r.title}</div>
                        {r.created_at && <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{new Date(r.created_at).toLocaleString()}</div>}
                      </td>
                      <td><span className="badge gray">{r.format.toUpperCase()}</span></td>
                      <td>
                        <span className={`badge ${r.status === "generated" ? "green" : r.status === "error" ? "red" : "blue"}`}>
                          {r.status === "generated" ? "Listo" : r.status === "error" ? "Error" : "Cola"}
                        </span>
                        {r.error && <div style={{ fontSize: 11, color: "#f87171" }}>{r.error}</div>}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {r.status === "generated" && (
                          <button className="btn btn-sm secondary" onClick={() => download(r.id, r.filename)} disabled={downloadingId === r.id}>
                            {downloadingId === r.id ? <Loader size={14} className="spin-icon" /> : <Download size={14} />}
                            <span>{downloadingId === r.id ? "…" : t("reports.download")}</span>
                          </button>
                        )}
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
