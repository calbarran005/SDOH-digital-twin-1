import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity } from "lucide-react";
import { useAuth } from "../store/auth";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch {
      setError("Credenciales inválidas");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <Activity size={40} style={{ color: "#3b82f6" }} />
          <h1 style={{ fontSize: 20, margin: "10px 0 4px" }}>
            SDOH Digital Twin
          </h1>
          <div className="text-muted" style={{ fontSize: 13 }}>
            Monitoreo de Determinantes Sociales de la Salud
          </div>
        </div>
        <div className="field">
          <label>Email o usuario</label>
          <input
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@sdohtwin.local"
          />
        </div>
        <div className="field">
          <label>Contraseña</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        {error && <div className="error-text">{error}</div>}
        <button className="btn" style={{ width: "100%" }} disabled={loading}>
          {loading ? "Ingresando…" : "Ingresar"}
        </button>
        <div className="text-muted" style={{ marginTop: 14, fontSize: 12 }}>
          Demo: <b>admin</b> / <b>admin123</b>
        </div>
      </form>
    </div>
  );
}
