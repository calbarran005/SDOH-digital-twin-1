import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Activity, Sparkles, ArrowRight } from "lucide-react";
import { useAuth } from "../store/auth";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError(t("auth.errorEmpty"));
      return;
    }
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch {
      setError(t("auth.errorInvalid"));
    } finally {
      setLoading(false);
    }
  };

  const autofillDemo = () => {
    setEmail("admin");
    setPassword("admin123");
  };

  return (
    <div className="auth-wrap">
      <div className="auth-bg-glow" />
      <form className="auth-card" onSubmit={submit}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: 16,
              background: "linear-gradient(135deg, rgba(59, 130, 246, 0.25) 0%, rgba(99, 102, 241, 0.3) 100%)",
              border: "1px solid rgba(59, 130, 246, 0.4)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#60a5fa",
              boxShadow: "0 0 24px rgba(59, 130, 246, 0.35)",
              marginBottom: 14,
            }}
          >
            <Activity size={32} />
          </div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 24,
              fontWeight: 700,
              margin: "0 0 6px",
              letterSpacing: "-0.02em",
              background: "linear-gradient(135deg, #ffffff 0%, #93c5fd 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            SDOH Digital Twin
          </h1>
          <div className="text-muted" style={{ fontSize: 13.5 }}>
            {t("auth.subtitle")}
          </div>
        </div>

        <div className="field">
          <label>{t("auth.email")}</label>
          <div style={{ position: "relative" }}>
            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth.emailPlaceholder")}
              autoFocus
            />
          </div>
        </div>

        <div className="field">
          <label>{t("auth.password")}</label>
          <div style={{ position: "relative" }}>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("auth.passwordPlaceholder")}
            />
          </div>
        </div>

        {error && <div className="error-text">{error}</div>}

        <button
          className="btn"
          style={{ width: "100%", marginTop: 12, height: 44 }}
          disabled={loading}
        >
          {loading ? t("auth.verifying") : (
            <>
              <span>{t("auth.login")}</span>
              <ArrowRight size={16} />
            </>
          )}
        </button>

        <div className="auth-demo-badge">
          <div>
            <div style={{ fontWeight: 600, color: "var(--text-main)" }}>{t("auth.demoCredentials")}</div>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
              {t("auth.demoUser")}: <b>admin</b> · {t("auth.demoPass")}: <b>admin123</b>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm secondary"
            onClick={autofillDemo}
            title={t("auth.autofillTitle")}
          >
            <Sparkles size={13} style={{ color: "#60a5fa" }} />
            <span>{t("auth.autofill")}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
