import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { User, Shield, Key, Clock } from "lucide-react";
import api from "../api/client";
import { useAuth } from "../store/auth";

export default function Profile() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    api.get("/users/me").then((r) => setProfile(r.data)).catch(() => {});
  }, []);

  return (
    <div>
      <div className="topbar">
        <div className="page-title-group">
          <h2 className="page-title">{t("profile.title")}</h2>
          <p className="page-subtitle">{t("profile.subtitle")}</p>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}><User size={18} style={{ color: "#60a5fa" }} />{t("profile.sessionInfo")}</h3>
          <div className="field"><label>{t("profile.username")}</label><div className="input" style={{ background: "var(--bg-surface)" }}>{profile?.username || user?.username || "—"}</div></div>
          <div className="field"><label>{t("profile.email")}</label><div className="input" style={{ background: "var(--bg-surface)" }}>{profile?.email || user?.email || "—"}</div></div>
          <div className="field"><label>{t("profile.fullName")}</label><div className="input" style={{ background: "var(--bg-surface)" }}>{profile?.profile?.full_name || "—"}</div></div>
          <div className="field"><label>{t("profile.organization")}</label><div className="input" style={{ background: "var(--bg-surface)" }}>{profile?.profile?.organization || "—"}</div></div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}><Shield size={18} style={{ color: "#60a5fa" }} />{t("profile.roles")}</h3>
          {profile?.roles?.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {profile.roles.map((r: any) => (
                <div key={r.id} className="card" style={{ padding: 14, background: "var(--bg-surface)" }}>
                  <div style={{ fontWeight: 600, color: "var(--text-main)" }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>{r.description}</div>
                </div>
              ))}
            </div>
          ) : <div className="text-muted">{t("profile.noRoles")}</div>}

          <h3 style={{ marginTop: 22 }}><Key size={18} style={{ color: "#60a5fa" }} />{t("profile.permissions")}</h3>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {profile?.roles?.flatMap((r: any) => r.permissions?.map((p: any) => p.code) || [])?.filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)?.map((perm: string) => (
              <span key={perm} className="badge gray">{perm}</span>
            )) || <span className="text-muted">—</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
