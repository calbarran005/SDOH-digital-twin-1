import { useEffect, useState } from "react";
import { Building2, MapPin } from "lucide-react";
import api from "../api/client";
import StatCard from "../components/StatCard";

interface Hospital {
  id: number;
  name: string;
  city?: string;
  state?: string;
  cms_id?: string;
  zip_code?: string;
}

interface Catchment {
  id: number;
  hospital_id: number;
  name: string;
  catchment_type: string;
  radius_km?: number;
  tract_count?: number;
}

interface GeoStats {
  hospitals: number;
  tracts: number;
  catchments: number;
  counties: number;
}

function makeDB() {
  return api;
}

export default function Hospitals() {
  const db = makeDB();
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [catchments, setCatchments] = useState<Catchment[]>([]);
  const [stats, setStats] = useState<GeoStats | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newState, setNewState] = useState("");

  const load = () => {
    db.get("/hospitals").then((r) => setHospitals(r.data)).catch(() => {});
    db.get("/geo/catchments").then((r) => setCatchments(r.data)).catch(() => {});
    db.get("/geo/health-system/stats").then((r) => setStats(r.data)).catch(() => {});
  };

  useEffect(load, []);

  const create = async () => {
    if (!newName) return;
    try {
      await db.post("/hospitals", {
        name: newName,
        city: newCity,
        state: newState,
      });
      setNewName("");
      setNewCity("");
      setNewState("");
      load();
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Error al crear");
    }
  };

  const selectedCatches = catchments.filter((c) => c.hospital_id === selected);

  return (
    <div>
      <div className="topbar">
        <h2 className="page-title">Hospitales y áreas de captación</h2>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 18 }}>
        <StatCard label="Hospitales" value={stats?.hospitals ?? "—"} icon={<Building2 size={20} />} />
        <StatCard label="Áreas captación" value={stats?.catchments ?? "—"} icon={<MapPin size={20} />} />
        <StatCard label="Tracts" value={stats?.tracts ?? "—"} icon={<MapPin size={20} />} />
        <StatCard label="Condados" value={stats?.counties ?? "—"} icon={<MapPin size={20} />} />
      </div>

      <div className="grid grid-3" style={{ marginBottom: 18 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Registrar hospital</h3>
          <div className="field">
            <label>Nombre</label>
            <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <div className="field">
            <label>Ciudad</label>
            <input className="input" value={newCity} onChange={(e) => setNewCity(e.target.value)} />
          </div>
          <div className="field">
            <label>Estado</label>
            <input className="input" value={newState} onChange={(e) => setNewState(e.target.value)} />
          </div>
          <button className="btn" onClick={create}>Guardar</button>
        </div>

        <div className="chart-card" style={{ gridColumn: "span 2" }}>
          <h3>Hospitales registrados</h3>
          {hospitals.length === 0 ? (
            <div className="empty-state">Sin hospitales</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Ciudad</th>
                  <th>Estado</th>
                  <th>Áreas</th>
                </tr>
              </thead>
              <tbody>
                {hospitals.map((h) => (
                  <tr
                    key={h.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => setSelected(h.id)}
                  >
                    <td>{h.name}</td>
                    <td>{h.city}</td>
                    <td>{h.state}</td>
                    <td>{catchments.filter((c) => c.hospital_id === h.id).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selected != null && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>
            Áreas de captación del hospital seleccionado
          </h3>
          {selectedCatches.length === 0 ? (
            <div className="empty-state">Sin áreas definidas — use el seed del backend</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>Radio (km)</th>
                  <th>Tracts</th>
                </tr>
              </thead>
              <tbody>
                {selectedCatches.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.catchment_type}</td>
                    <td>{c.radius_km}</td>
                    <td>{c.tract_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
