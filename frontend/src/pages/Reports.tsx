import { useEffect, useState } from "react";
import { Download, FileText, FileSpreadsheet, FileType, Loader } from "lucide-react";
import api from "../api/client";

interface Report {
  id: number;
  title: string;
  report_type: string;
  format: string;
  status: string;
  filename?: string;
  created_at?: string;
  error?: string;
}

interface Hospital {
  id: number;
  name: string;
}

const FORMATS = [
  { value: "pdf", label: "PDF", icon: FileText },
  { value: "word", label: "Word (.docx)", icon: FileType },
  { value: "excel", label: "Excel (.xlsx)", icon: FileSpreadsheet },
  { value: "csv", label: "CSV", icon: FileType },
];

export default function Reports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [title, setTitle] = useState("Reporte de equidad SDOH");
  const [hospitalId, setHospitalId] = useState<number | null>(null);
  const [year, setYear] = useState(2022);
  const [format, setFormat] = useState("pdf");
  const [domains, setDomains] = useState("");
  const [generating, setGenerating] = useState(false);

  const load = () => {
    api.get("/reports").then((r) => setReports(r.data)).catch(() => {});
  };

  useEffect(() => {
    load();
    api.get("/hospitals").then((r) => setHospitals(r.data)).catch(() => {});
  }, []);

  const generate = async () => {
    setGenerating(true);
    try {
      await api.post("/reports/generate", {
        title,
        report_type: "catchment_equity",
        format,
        hospital_id: hospitalId,
        year,
        domains: domains ? domains.split(",").map((d) => d.trim()).filter(Boolean) : null,
      });
      load();
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Error al generar el reporte");
    } finally {
      setGenerating(false);
    }
  };

  const download = (id: number) => {
    window.open(`${import.meta.env.VITE_API_URL || "http://localhost:8000"}/api/reports/download/${id}`, "_blank");
  };

  return (
    <div>
      <div className="topbar">
        <h2 className="page-title">Generación de reportes</h2>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 18 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Configurar reporte</h3>
          <div className="field">
            <label>Título</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label>Hospital</label>
            <select className="select" value={hospitalId ?? ""} onChange={(e) => setHospitalId(e.target.value ? +e.target.value : null)}>
              <option value="">-- Seleccionar --</option>
              {hospitals.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Año</label>
            <input className="input" type="number" value={year} onChange={(e) => setYear(+e.target.value)} />
          </div>
          <div className="field">
            <label>Dominios (separados por coma)</label>
            <input className="input" value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="Ingreso,Educación,Vivienda" />
          </div>
          <div className="field">
            <label>Formato</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {FORMATS.map((f) => (
                <button
                  key={f.value}
                  className={`btn btn-sm ${format === f.value ? "" : "secondary"}`}
                  onClick={() => setFormat(f.value)}
                >
                  <f.icon size={14} style={{ marginRight: 4 }} /> {f.label}
                </button>
              ))}
            </div>
          </div>
          <button className="btn" onClick={generate} disabled={generating || !hospitalId}>
            {generating ? <Loader size={15} style={{ marginRight: 6 }} /> : <FileText size={15} style={{ marginRight: 6 }} />}
            {generating ? "Generando…" : "Generar reporte"}
          </button>
        </div>

        <div className="chart-card">
          <h3>Reportes generados</h3>
          {reports.length === 0 ? (
            <div className="empty-state">Genera tu primer reporte</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Formato</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td>{r.title}</td>
                    <td>
                      <span className="badge gray">{r.format.toUpperCase()}</span>
                    </td>
                    <td>
                      <span className={`badge ${r.status === "generated" ? "green" : r.status === "error" ? "red" : "blue"}`}>
                        {r.status}
                      </span>
                      {r.error && <div className="text-muted" style={{ fontSize: 11 }}>{r.error}</div>}
                    </td>
                    <td>
                      {r.status === "generated" && (
                        <button className="btn btn-sm secondary" onClick={() => download(r.id)}>
                          <Download size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Formatos soportados</h3>
        <p className="text-muted" style={{ fontSize: 13 }}>
          PDF y Word generan documentos con resumen por dominio, gráfico de barras y población del área de
          captación. Excel y CSV exportan el detalle de indicadores por census tract para análisis posterior.
          Los reportes se almacenan en <b>backend/generated_reports</b>.
        </p>
      </div>
    </div>
  );
}
