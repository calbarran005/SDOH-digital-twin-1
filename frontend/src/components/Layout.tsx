import { NavLink, Outlet, useNavigate } from "react-router-dom";
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
} from "lucide-react";
import { useAuth } from "../store/auth";

const navItems = [
  { to: "/dashboard", label: "Dashboard 3D", icon: LayoutDashboard, perm: [] },
  { to: "/mapa", label: "Mapa SDOH", icon: Map, perm: [] },
  { to: "/equidad", label: "Equidad en Salud", icon: Scale, perm: [] },
  { to: "/hospitales", label: "Hospitales", icon: Hospital, perm: [] },
  { to: "/alertas", label: "Alertas", icon: AlertTriangle, perm: [] },
  { to: "/reportes", label: "Reportes", icon: FileText, perm: [] },
  { to: "/usuarios", label: "Usuarios", icon: Users, perm: ["users:manage"] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const visible = navItems.filter((item) =>
    item.perm.length === 0 || user?.is_superuser || true
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <h1>SDOH Digital Twin</h1>
          <small>Equidad en Salud · Áreas hospitalarias</small>
        </div>
        <nav className="nav-section">
          {visible.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <item.icon size={17} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: "14px", borderTop: "1px solid #1e293b" }}>
          <NavLink to="/perfil" className="nav-item">
            <User size={17} />
            {user?.profile?.full_name || user?.username}
          </NavLink>
          <div className="nav-item" onClick={handleLogout}>
            <LogOut size={17} />
            Cerrar sesión
          </div>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
