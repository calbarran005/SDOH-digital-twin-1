import { useEffect, useState } from "react";
import { Save, User as UserIcon } from "lucide-react";
import api from "../api/client";
import { useAuth } from "../store/auth";

export default function Profile() {
  const { user } = useAuth();
  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [organization, setOrganization] = useState("");
  const [phone, setPhone] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user?.profile) {
      setFullName(user.profile.full_name || "");
      setJobTitle(user.profile.job_title || "");
      setDepartment(user.profile.department || "");
      setOrganization(user.profile.organization || "");
      setPhone(user.profile.phone || "");
    }
  }, [user]);

  const save = async () => {
    try {
      await api.patch(`/users/${user!.id}/profile`, {
        full_name: fullName,
        job_title: jobTitle,
        department,
        organization,
        phone,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
  };

  return (
    <div>
      <div className="topbar">
        <h2 className="page-title">Mi perfil</h2>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%",
              background: "#1d4ed8", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <UserIcon size={24} />
            </div>
            <div>
              <b style={{ fontSize: 16 }}>{user?.profile?.full_name || user?.username}</b>
              <div className="text-muted" style={{ fontSize: 12 }}>{user?.email}</div>
            </div>
          </div>
          <div className="field">
            <label>Nombre completo</label>
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="field">
            <label>Cargo</label>
            <input className="input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          </div>
          <div className="field">
            <label>Departamento</label>
            <input className="input" value={department} onChange={(e) => setDepartment(e.target.value)} />
          </div>
          <div className="field">
            <label>Organización</label>
            <input className="input" value={organization} onChange={(e) => setOrganization(e.target.value)} />
          </div>
          <div className="field">
            <label>Teléfono</label>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <button className="btn" onClick={save}>
            <Save size={15} style={{ marginRight: 4 }} /> {saved ? "Guardado ✓" : "Guardar cambios"}
          </button>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Mis roles y permisos</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {user?.roles.map((r) => (
              <span key={r.id} className="badge blue" style={{ fontSize: 13, padding: "5px 12px" }}>
                {r.name}
              </span>
            ))}
            {user?.is_superuser && (
              <span className="badge red" style={{ fontSize: 13, padding: "5px 12px" }}>
                Superusuario
              </span>
            )}
          </div>
          <hr className="divider" />
          <div className="stat-label">Cuenta creada</div>
          <div className="stat-value" style={{ fontSize: 15 }}>
            {user?.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}
          </div>
          <div className="stat-label" style={{ marginTop: 12 }}>Último acceso</div>
          <div className="stat-value" style={{ fontSize: 15 }}>
            {user?.last_login ? new Date(user.last_login).toLocaleString() : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}
