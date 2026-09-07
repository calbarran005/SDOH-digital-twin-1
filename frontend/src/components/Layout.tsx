import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Activity,
  AlertTriangle,
  FileText,
  Hospital,
  LayoutDashboard,
  LogOut,
  Map,
  Scale,
  User,
  Users,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "../store/auth";
import ThemeToggle from "./ThemeToggle";
import LanguageToggle from "./LanguageToggle";
import AIChat from "./AIChat";

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const navItems = [
    { to: "/dashboard", label: t("nav.dashboard"), icon: LayoutDashboard, perm: [] },
    { to: "/mapa", label: t("nav.sdohMap"), icon: Map, perm: [] },
    { to: "/equidad", label: t("nav.equity"), icon: Scale, perm: [] },
    { to: "/hospitales", label: t("nav.hospitals"), icon: Hospital, perm: [] },
    { to: "/alertas", label: t("nav.alerts"), icon: AlertTriangle, perm: [] },
    { to: "/reportes", label: t("nav.reports"), icon: FileText, perm: [] },
    { to: "/usuarios", label: t("nav.users"), icon: Users, perm: ["users:manage"] },
  ];

  const visible = navItems.filter(
    (item) => item.perm.length === 0 || user?.is_superuser || true
  );

  return (
    <div className="app-shell">
      {/* Mobile Topbar */}
      <header className="mobile-header">
        <div className="brand" style={{ padding: 0, border: "none" }}>
          <div className="brand-icon-wrap" style={{ width: 34, height: 34 }}>
            <Activity size={18} />
          </div>
          <div className="brand-info">
            <h1 style={{ fontSize: 15 }}>SDOH Digital Twin</h1>
          </div>
        </div>
        <button
          type="button"
          className="mobile-menu-toggle"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="mobile-backdrop"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar Drawer */}
      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="brand">
          <div className="brand-icon-wrap">
            <Activity size={22} />
          </div>
          <div className="brand-info" style={{ flex: 1 }}>
            <h1>SDOH Digital Twin</h1>
            <small>{t("auth.subtitle")}</small>
          </div>
          <button
            type="button"
            className="mobile-sidebar-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="nav-section">
          <div className="nav-section-title">{t("nav.platform")}</div>
          {visible.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="system-status-pill">
            <div className="status-dot" />
            <span style={{ fontWeight: 600 }}>{t("nav.digitalTwin")}</span>
            <span style={{ color: "var(--text-dim)" }}>· PostGIS</span>
          </div>

          <NavLink
            to="/perfil"
            className="nav-item"
            onClick={() => setMobileOpen(false)}
          >
            <User size={18} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user?.profile?.full_name || user?.username || t("nav.profile")}
            </span>
          </NavLink>

          <LanguageToggle />
          <ThemeToggle />

          <button
            type="button"
            className="nav-item"
            onClick={handleLogout}
            style={{ color: "var(--risk-critical)" }}
          >
            <LogOut size={18} />
            <span>{t("nav.logout")}</span>
          </button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
      <AIChat />
    </div>
  );
}
