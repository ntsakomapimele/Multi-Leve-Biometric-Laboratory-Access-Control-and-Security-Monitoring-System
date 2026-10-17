import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { canAccess } from "../auth/roles";

const NAV_SECTIONS = [
  {
    label: "Overview",
    items: [{ to: "/", label: "Dashboard", icon: "◈" }],
  },
  {
    label: "Access Control",
    items: [
      { to: "/laboratories", label: "Laboratories", icon: "▢" },
      { to: "/permissions", label: "Access Permissions", icon: "✓" },
      { to: "/biometric-profiles", label: "Biometric Profiles", icon: "◉" },
    ],
  },
  {
    label: "Monitoring",
    items: [
      { to: "/authentication-events", label: "Authentication Log", icon: "≡" },
      { to: "/security-events", label: "Security Events", icon: "!" },
    ],
  },
  {
    label: "Console",
    items: [
      { to: "/terminal", label: "Access Terminal", icon: "▣" },
      { to: "/authenticate", label: "Reader Test", icon: "▶" },
    ],
  },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => canAccess(user?.role, item.to)),
  })).filter((section) => section.items.length > 0);
  const initials = (user?.username || "?").slice(0, 2).toUpperCase();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" />
          <div className="brand-text">
            <strong>SentryLab</strong>
            <span>Access Console</span>
          </div>
        </div>

        <nav>
          {visibleSections.map((section) => (
            <div className="nav-group" key={section.label}>
              <div className="nav-label">{section.label}</div>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="session-card">
            <div className="session-avatar">{initials}</div>
            <div className="session-meta">
              <strong>{user?.username}</strong>
              <span>AUTHENTICATED</span>
            </div>
          </div>
          <button className="logout-btn" onClick={logout}>
            End session
          </button>
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
