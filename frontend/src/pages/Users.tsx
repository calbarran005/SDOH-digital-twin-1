import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck, UserPlus, Shield, User as UserIcon, X } from "lucide-react";
import api from "../api/client";
import type { Role, User } from "../types";

export default function Users() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [roleCodes, setRoleCodes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.get("/users").then((r) => setUsers(r.data)).catch(() => {});
    api.get("/users/roles/all").then((r) => setRoles(r.data)).catch(() => {});
  };
  useEffect(load, []);

  const create = async () => {
    if (!username || !email || !password) { setError("Username, email y contraseña son requeridos"); return; }
    setError(""); setSaving(true);
    try {
      await api.post("/users", { username, email, password, full_name: fullName, role_codes: roleCodes });
      setShowForm(false); setUsername(""); setEmail(""); setPassword(""); setFullName(""); setRoleCodes([]); load();
    } catch (e: any) { setError(e?.response?.data?.detail || "Error"); } finally { setSaving(false); }
  };

  const toggleRole = (code: string) => { setRoleCodes((prev) => prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]); };

  const deleteUser = async (id: number, uname: string) => {
    if (!confirm(`Eliminar usuario "${uname}"?`)) return;
    try { await api.delete(`/users/${id}`); load(); } catch (e: any) { alert(e?.response?.data?.detail || "Error"); }
  };

  return (
    <div>
      <div className="topbar">
        <div className="page-title-group">
          <h2 className="page-title">{t("users.title")}</h2>
          <p className="page-subtitle">{t("users.subtitle")}</p>
        </div>
        <button className="btn" onClick={() => setShowForm((s) => !s)}>
          {showForm ? <X size={16} /> : <UserPlus size={16} />}
          <span>{showForm ? t("common.cancel") : t("users.addUser")}</span>
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 22, border: "1px solid rgba(59, 130, 246, 0.35)" }}>
          <h3 style={{ marginTop: 0 }}><UserPlus size={18} style={{ color: "#60a5fa" }} />{t("users.createUser")}</h3>
          <div className="grid grid-2">
            <div className="field"><label>{t("users.username")}</label><input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="jdoe" /></div>
            <div className="field"><label>{t("users.email")}</label><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jdoe@hospital.org" /></div>
            <div className="field"><label>{t("profile.fullName")}</label><input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Dr. John Doe" /></div>
            <div className="field"><label>{t("users.password")}</label><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></div>
          </div>
          <div className="field">
            <label>{t("profile.roles")}</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {roles.map((r) => (
                <button key={r.id} type="button" className={`btn btn-sm ${roleCodes.includes(r.code) ? "" : "secondary"}`} onClick={() => toggleRole(r.code)}>
                  <ShieldCheck size={14} /><span>{r.name}</span>
                </button>
              ))}
            </div>
          </div>
          {error && <div className="error-text">{error}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button className="btn" onClick={create} disabled={saving}>{saving ? t("common.loading") : t("common.create")}</button>
            <button className="btn secondary" onClick={() => setShowForm(false)}>{t("common.cancel")}</button>
          </div>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}><Shield size={18} style={{ color: "#60a5fa" }} />{t("users.title")} ({users.length})</h3>
        {users.length === 0 ? (
          <div className="empty-state">{t("users.noUsers")}</div>
        ) : (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr><th>{t("users.username")}</th><th>{t("users.email")}</th><th>{t("users.role")}</th><th>{t("users.active")}</th><th>{t("users.actions")}</th></tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <UserIcon size={16} style={{ color: "#60a5fa" }} />
                        <div>
                          <div style={{ fontWeight: 600, color: "var(--text-main)" }}>{u.username}</div>
                          {u.is_superuser && <span className="badge blue" style={{ fontSize: 10 }}>{t("users.superuser")}</span>}
                        </div>
                      </div>
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {u.roles?.map((r) => <span key={r.id} className="badge gray">{r.name}</span>)}
                      </div>
                    </td>
                    <td><span className={`badge ${u.is_active ? "green" : "red"}`}>{u.is_active ? t("common.yes") : t("common.no")}</span></td>
                    <td>
                      {!u.is_superuser && (
                        <button className="btn btn-sm danger" onClick={() => deleteUser(u.id, u.username)}>
                          {t("common.delete")}
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
  );
}
