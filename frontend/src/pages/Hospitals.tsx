import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, MapPin, Plus, Radio, Globe } from "lucide-react";
import api from "../api/client";
import { errorMessage } from "../api/errors";
import StatCard from "../components/StatCard";

interface Hospital { id: number; name: string; city?: string; state?: string; cms_id?: string; }
interface Catchment { id: number; hospital_id: number; name: string; catchment_type: string; radius_km?: number; tract_count?: number; }
interface GeoStats { hospitals: number; tracts: number; catchments: number; counties: number; }

export default function Hospitals() {
  const { t } = useTranslation();
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [catchments, setCatchments] = useState<Catchment[]>([]);
  const [stats, setStats] = useState<GeoStats | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newState, setNewState] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.get("/hospitals").then((r) => { setHospitals(r.data); if (r.data.length > 0 && selected === null) setSelected(r.data[0].id); }).catch(() => {});
    api.get("/geo/catchments").then((r) => setCatchments(r.data)).catch(() => {});
    api.get("/geo/health-system/stats").then((r) => setStats(r.data)).catch(() => {});
  };
  useEffect(load, []);

  const create = async () => {
    if (!newName) return;
    setSaving(true);
    try {
      await api.post("/hospitals", { name: newName, city: newCity, state: newState });
      setNewName(""); setNewCity(""); setNewState(""); load();
    } catch (e: any) { alert(errorMessage(e, "Error")); } finally { setSaving(false); }
  };

  const selectedHospital = hospitals.find((h) => h.id === selected);
  const selectedCatches = catchments.filter((c) => c.hospital_id === selected);

  return (
    <div>
      <div className="topbar">
        <div className="page-title-group">
          <h2 className="page-title">{t("hospitals.title")}</h2>
          <p className="page-subtitle">{t("hospitals.subtitle")}</p>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 22 }}>
        <StatCard label={t("hospitals.name") + "s"} value={stats?.hospitals ?? "—"} icon={<Building2 size={22} />} subtext="Centros" />
        <StatCard label={t("hospitals.catchmentAreas")} value={stats?.catchments ?? "—"} icon={<Radio size={22} />} subtext="Polígonos" />
        <StatCard label="Tracts" value={stats?.tracts ?? "—"} icon={<MapPin size={22} />} subtext="Mapeados" />
        <StatCard label="Condados" value={stats?.counties ?? "—"} icon={<Globe size={22} />} subtext="Jurisdicciones" />
      </div>

      <div className="grid grid-3" style={{ marginBottom: 22 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}><Plus size={18} style={{ color: "#60a5fa" }} />{t("hospitals.addHospital")}</h3>
          <div className="field">
            <label>{t("hospitals.hospitalName")}</label>
            <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Metropolitan General" />
          </div>
          <div className="field">
            <label>Ciudad</label>
            <input className="input" value={newCity} onChange={(e) => setNewCity(e.target.value)} placeholder="New York" />
          </div>
          <div className="field">
            <label>Estado</label>
            <input className="input" value={newState} onChange={(e) => setNewState(e.target.value)} placeholder="NY" />
          </div>
          <button className="btn" style={{ width: "100%" }} onClick={create} disabled={saving || !newName}>
            {saving ? t("common.loading") : t("common.save")}
          </button>
        </div>

        <div className="chart-card" style={{ gridColumn: "span 2" }}>
          <h3>
            <span>{t("hospitals.title")}</span>
            <span className="badge blue">{hospitals.length}</span>
          </h3>
          {hospitals.length === 0 ? (
            <div className="empty-state">{t("hospitals.noHospitals")}</div>
          ) : (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr><th>{t("hospitals.name")}</th><th>Ubicación</th><th>{t("hospitals.catchmentArea")}</th><th>{t("common.status")}</th></tr>
                </thead>
                <tbody>
                  {hospitals.map((h) => {
                    const isSel = selected === h.id;
                    const cCount = catchments.filter((c) => c.hospital_id === h.id).length;
                    return (
                      <tr key={h.id} style={{ cursor: "pointer", background: isSel ? "rgba(59, 130, 246, 0.12)" : undefined }} onClick={() => setSelected(h.id)}>
                        <td>
                          <div style={{ fontWeight: 600, color: "var(--text-main)" }}>{h.name}</div>
                          {h.cms_id && <div style={{ fontSize: 11, color: "var(--text-dim)" }}>CMS: {h.cms_id}</div>}
                        </td>
                        <td>{h.city ? `${h.city}, ${h.state || ""}` : "—"}</td>
                        <td><span className="badge gray">{cCount}</span></td>
                        <td><span className="badge green">{t("common.active")}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selectedHospital && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}><Radio size={18} style={{ color: "#60a5fa" }} />{selectedHospital.name}</h3>
          {selectedCatches.length === 0 ? (
            <div className="empty-state">Sin áreas de captación configuradas.</div>
          ) : (
            <div className="table-responsive">
              <table className="table">
                <thead><tr><th>Nombre</th><th>Tipo</th><th>Radio</th><th>Tracts</th></tr></thead>
                <tbody>
                  {selectedCatches.map((c) => (
                    <tr key={c.id}>
                      <td><b>{c.name}</b></td>
                      <td><span className="badge blue">{c.catchment_type}</span></td>
                      <td style={{ fontFamily: "var(--font-mono)" }}>{c.radius_km ? `${c.radius_km} km` : "N/A"}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{c.tract_count || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
