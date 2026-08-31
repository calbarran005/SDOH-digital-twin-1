import { useEffect, useState } from "react";
import { ShieldCheck, Trash2, UserPlus } from "lucide-react";
import api from "../api/client";
import type { Role, User } from "../types";

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [roleCodes, setRoleCodes] = useState<string[]>([]);

  const load = () => {
    api.get("/users").then((r) => setUsers(r.data)).catch(() => {});
    api.get("/users/roles/all").then((r) => setRoles(r.data)).catch(() => {});
  };

  useEffect(load, []);

  const create = async () => {
    setError("");
    try {
      await api.post("/users", {
        username,
        email,
        password,
        full_name: fullName,
        role_codes: roleCodes,
      });
      setShowForm(false);
      reset();
      load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Error al crear usuario");
    }
  };

  const reset = () => {
    setUsername("");
    setEmail("");
    setPassword("");
    setFullName("");
    setRoleCodes([]);
  };

  const toggleRole = (code: string) => {
    setRoleCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const deleteUser = async (id: number) => {
    if (!confirm("¿Eliminar este usuario?")) return;
    try {
      await api.delete(`/users/${id}`);
      load();
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Error al eliminar");
    }
  };

  return (
    <div>
      <div className="topbar">
        <h2 className="page-title">Gestión de usuarios</h2>
        <button className="btn" onClick={() => setShowForm((s) => !s)}>
          <UserPlus size={15} style={{ marginRight: 4 }} />
          Nuevo usuario
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h3 style={{ marginTop: 0 }}>Crear usuario</h3>
          <div className="grid grid-2">
            <div className="field">
              <label>Username</label>
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="field">
              <label>Email</label>
              <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label>Nombre completo</label>
              <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="field">
              <label>Contraseña</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Roles</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {roles.map((r) => (
                <button
                  key={r.id}
                  className={`btn btn-sm ${roleCodes.includes(r.code) ? "" : "secondary"}`}
                  onClick={() => toggleRole(r.code)}
                >
                  <ShieldCheck size={13} style={{ marginRight: 4 }} />
                  {r.name}
                </button>
              ))}
            </div>
          </div>
          {error && <div className="error-text">{error}</div>}
          <button className="btn" onClick={create}>Guardar usuario</button>
        </div>
      )}

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Email</th>
              <th>Roles</th>
              <th>Estado</th>
              <th>Admin</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <b>{u.username}</b>
                  <div className="text-muted" style={{ fontSize: 11 }}>{u.profile?.full_name}</div>
                </td>
                <td>{u.email}</td>
                <td>
                  {u.roles.map((r) => (
                    <span key={r.id} className="badge blue" style={{ marginRight: 4 }}>
                      {r.code}
                    </span>
                  ))}
                </td>
                <td>
                  <span className={`badge ${u.is_active ? "green" : "red"}`}>
                    {u.is_active ? "activo" : "inactivo"}
                  </span>
                </td>
                <td>{u.is_superuser ? "Sí" : "No"}</td>
                <td>
                  <button className="btn btn-sm danger" onClick={() => deleteUser(u.id)}>
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
