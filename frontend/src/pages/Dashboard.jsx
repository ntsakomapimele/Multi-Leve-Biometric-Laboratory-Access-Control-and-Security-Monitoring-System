import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { ROLES } from "../auth/roles";
import { PageHead, Panel, ResultBadge, SeverityBadge, LoadingRow, EmptyState, ErrorAlert, Modal } from "../components/ui";

// Each card fetches independently and swallows 403s to "—" rather than
// failing the whole dashboard — a Laboratory User can't see security
// events (CanViewSecurityEvents), but should still see laboratory counts.
function useCount(endpoint) {
  const [count, setCount] = useState(null);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!endpoint) {
      setCount(null);
      setDenied(false);
      setError("");
      return undefined;
    }

    let active = true;
    api
      .get(endpoint)
      .then((res) => {
        if (!active) return;
        setDenied(false);
        setError("");
        const data = res.data;
        setCount(Array.isArray(data) ? data.length : data.count ?? data.results?.length ?? 0);
      })
      .catch((err) => {
        if (!active) return;
        if (err.response?.status === 403) {
          setDenied(true);
        } else {
          setCount(null);
          setError(extractErrorMessage(err, "Couldn't load dashboard statistics."));
        }
      });
    return () => {
      active = false;
    };
  }, [endpoint]);

  return { count, denied, error };
}

export default function Dashboard() {
  const { user } = useAuth();
  const isLaboratoryUser = user?.role === ROLES.LABORATORY_USER;
  const [userModalOpen, setUserModalOpen] = useState(false);
  const labs = useCount("/laboratories/");
  const permissions = useCount("/access-permissions/");
  const events = useResourceForFeed(isLaboratoryUser ? null : "/authentication-events/");
  const security = useResourceForFeed(isLaboratoryUser ? null : "/security-events/");
  const profiles = useResourceForFeed(isLaboratoryUser ? null : "/biometric-profiles/");

  if (isLaboratoryUser) {
    return (
      <>
        <PageHead
          eyebrow="Workspace / Laboratory access"
          title="Laboratory workspace"
          sub="Review laboratories and manage the access permissions assigned to you."
        />
        <div className="stat-grid">
          <StatCard label="Available Laboratories" value={labs.count} denied={labs.denied || Boolean(labs.error)} tone="accent" />
          <StatCard label="Active Permissions" value={permissions.count} denied={permissions.denied || Boolean(permissions.error)} tone="accent" />
        </div>
          <ErrorAlert message={[labs.error, permissions.error].filter(Boolean).join(" ")} />
        <Panel title="Your access workspace" sub="Use the navigation to review laboratory access and run a biometric check.">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link className="btn btn-sm" to="/laboratories">Browse laboratories →</Link>
            <Link className="btn btn-sm" to="/permissions">Review permissions →</Link>
            <Link className="btn btn-sm" to="/terminal">Open access terminal →</Link>
          </div>
        </Panel>
      </>
    );
  }

  const recentEvents = Array.isArray(events.data)
    ? events.data.filter((event) => {
        const timestamp = new Date(event.timestamp).getTime();
        return Number.isFinite(timestamp) && timestamp >= Date.now() - 24 * 60 * 60 * 1000;
      })
    : null;
  const grantedCount = recentEvents?.filter((event) => event.result === "GRANTED").length ?? null;
  const deniedCount = recentEvents?.filter((event) => event.result === "DENIED").length ?? null;
  const openSecurity = Array.isArray(security.data)
    ? security.data.filter((event) => !event.resolved).length
    : null;
  const highSeverityOpen = Array.isArray(security.data)
    ? security.data.filter((event) => !event.resolved && event.severity === "HIGH").length
    : null;
  const profileList = Array.isArray(profiles.data) ? profiles.data : null;
  const credentialReady = profileList?.filter(
    (profile) => profile.face_registered && profile.fingerprint_id != null
  ).length ?? null;
  const missingCredentials = profileList
    ? profileList.length - credentialReady
    : null;
  const grantRate = recentEvents?.length
    ? Math.round((grantedCount / recentEvents.length) * 100)
    : null;
  const topDenial = recentEvents
    ?.filter((event) => event.result === "DENIED" && event.denial_reason)
    .reduce((counts, event) => {
      counts[event.denial_reason] = (counts[event.denial_reason] || 0) + 1;
      return counts;
    }, {});
  const mostCommonDenial = topDenial
    ? Object.entries(topDenial).sort((a, b) => b[1] - a[1])[0]
    : null;

  return (
    <>
      <PageHead
        eyebrow={user?.role === ROLES.SECURITY_OFFICER ? "Monitoring / Overview" : "Console / Overview"}
        title={user?.role === ROLES.SECURITY_OFFICER ? "Security status" : "System status"}
        sub={user?.role === ROLES.SECURITY_OFFICER
          ? "Monitor access trends, credential readiness, and unresolved alerts. User registration and biometric enrollment are administrator-only."
          : "Live snapshot of laboratories, credentials, and recent access activity."}
        action={user?.role === ROLES.ADMINISTRATOR && (
          <button className="btn btn-primary" onClick={() => setUserModalOpen(true)}>
            + Add user
          </button>
        )}
      />

      <div className="stat-grid">
        <StatCard label="Laboratories" value={labs.count} denied={labs.denied || Boolean(labs.error)} tone="accent" />
        {user?.role === ROLES.ADMINISTRATOR && <StatCard label="Permission records" value={permissions.count} denied={permissions.denied || Boolean(permissions.error)} tone="accent" />}
        <StatCard label="Access attempts · 24h" value={recentEvents?.length ?? null} denied={events.denied || Boolean(events.error)} tone="accent" />
        <StatCard label="Grant rate · 24h" value={grantRate === null ? (recentEvents?.length === 0 ? "—" : null) : `${grantRate}%`} denied={events.denied || Boolean(events.error)} tone="granted" />
        <StatCard
          label="Biometric-ready users"
          value={profileList === null ? null : `${credentialReady}/${profileList.length}`}
          denied={profiles.denied || Boolean(profiles.error)}
          tone="accent"
          detail={profileList === null ? "" : `${missingCredentials} missing a face or fingerprint`}
        />
        <StatCard label="Open security alerts" value={openSecurity} denied={security.denied || Boolean(security.error)} tone="warn" />
      </div>
      <ErrorAlert message={[labs.error, permissions.error, events.error, security.error, profiles.error].filter(Boolean).join(" ")} />

      <Panel
        title="Operational insights"
        sub="A rolling 24-hour view of access decisions, credential readiness, and active risk."
        className="insights-panel"
      >
        <div className="insight-grid">
          <div className="insight-item">
            <span className="insight-label">Access decisions</span>
            <strong>{recentEvents === null ? "···" : `${grantedCount} granted · ${deniedCount} denied`}</strong>
            <div className="insight-bar" aria-label={`${grantedCount ?? 0} granted and ${deniedCount ?? 0} denied`}>
              <span className="insight-bar-granted" style={{ width: `${grantRate ?? 0}%` }} />
              <span className="insight-bar-denied" style={{ width: `${recentEvents?.length ? 100 - grantRate : 0}%` }} />
            </div>
          </div>
          <div className="insight-item">
            <span className="insight-label">Most common denial</span>
            <strong>{events.loading ? "Loading activity…" : mostCommonDenial?.[0] || "No denials in the last 24 hours"}</strong>
            {mostCommonDenial && <small>{mostCommonDenial[1]} occurrence{mostCommonDenial[1] === 1 ? "" : "s"}</small>}
          </div>
          <div className="insight-item">
            <span className="insight-label">Credential gaps</span>
            <strong>{profiles.loading ? "Loading profiles…" : missingCredentials === null ? "Unavailable" : `${missingCredentials} profile${missingCredentials === 1 ? "" : "s"} need attention`}</strong>
            <small>{security.loading ? "Checking alert queue…" : highSeverityOpen === null ? "Alert data unavailable" : `${highSeverityOpen} high-severity open alert${highSeverityOpen === 1 ? "" : "s"}`}</small>
          </div>
        </div>
        {user?.role === ROLES.ADMINISTRATOR && (
          <div className="insight-actions">
            <Link className="btn btn-sm" to="/biometric-profiles">Review credentials →</Link>
            <Link className="btn btn-sm" to="/security-events">Triage alerts →</Link>
          </div>
        )}
        {user?.role === ROLES.SECURITY_OFFICER && (
          <div className="insight-actions">
            <Link className="btn btn-sm" to="/authentication-events">Investigate access log →</Link>
            <Link className="btn btn-sm" to="/security-events">Triage alerts →</Link>
          </div>
        )}
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 18 }} className="dash-grid">
        <Panel title="Recent authentication attempts" sub="Latest results from the access reader.">
          {events.loading && <LoadingRow />}
          {events.denied && (
            <EmptyState glyph="⛔" title="Restricted" hint="Security Officer or Administrator access required." />
          )}
          {!events.loading && !events.denied && events.data?.length === 0 && (
            <EmptyState glyph="∅" title="No authentication attempts recorded yet." />
          )}
          {!events.loading && events.data && events.data.length > 0 && (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Laboratory</th>
                    <th>Face</th>
                    <th>Fingerprint</th>
                    <th>Result</th>
                    <th>Decision detail</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {events.data.slice(0, 6).map((ev) => (
                    <tr key={ev.id}>
                      <td>{ev.user_display || ev.user || "Unknown"}</td>
                      <td>{ev.laboratory_display || "Unknown laboratory"}</td>
                      <td className="mono dim">{ev.face_verified ? "✓" : "—"}</td>
                      <td className="mono dim">{ev.fingerprint_verified ? "✓" : "—"}</td>
                      <td>
                        <ResultBadge result={ev.result} />
                      </td>
                      <td className="dim">{ev.denial_reason || "All checks passed"}</td>
                      <td className="mono dim">{formatTime(ev.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <Link className="btn btn-sm" to="/authentication-events">
              View full log →
            </Link>
          </div>
        </Panel>

        <Panel title="Open security events" sub="Unresolved alerts across all laboratories.">
          {security.loading && <LoadingRow />}
          {security.denied && (
            <EmptyState glyph="⛔" title="Restricted" hint="Security Officer or Administrator access required." />
          )}
          {!security.loading && !security.denied && (security.data || []).filter((e) => !e.resolved).length === 0 && (
            <EmptyState glyph="✓" title="No open security events." />
          )}
          {!security.loading &&
            (security.data || [])
              .filter((e) => !e.resolved)
              .slice(0, 6)
              .map((ev) => (
                <div
                  key={ev.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "10px 0",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{formatEventType(ev.event_type)}</div>
                    <div className="faint" style={{ fontSize: 11.5, marginTop: 2 }}>
                      {ev.laboratory_display || `Lab #${ev.laboratory}`} · {formatTime(ev.timestamp)}
                    </div>
                  </div>
                  <SeverityBadge severity={ev.severity} />
                </div>
              ))}
          <div style={{ marginTop: 14 }}>
            <Link className="btn btn-sm" to="/security-events">
              View all security events →
            </Link>
          </div>
        </Panel>
      </div>
      {user?.role !== ROLES.LABORATORY_USER && (
        <div className="hardware-readiness">
          <div className="hardware-readiness-head">
            <div><span className="terminal-kicker">SYSTEM READINESS</span><h2>Reader hardware</h2></div>
            <span className="hardware-mode"><span className="status-dot status-warning" />TEST MODE</span>
          </div>
          <div className="hardware-state-grid">
            <HardwareState label="Face recognition" state="Configured" tone="good" detail="OpenCV service" />
            <HardwareState label="Fingerprint reader" state="Offline" tone="warning" detail="No sensor connected" />
            <HardwareState label="Door controller" state="Not connected" tone="warning" detail="No physical release" />
          </div>
        </div>
      )}
      {userModalOpen && <CreateUserModal onClose={() => setUserModalOpen(false)} />}
    </>
  );
}

function CreateUserModal({ onClose }) {
  const [form, setForm] = useState({ username: "", password: "", role: ROLES.LABORATORY_USER });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = { ...form };
      if (payload.role === ROLES.LABORATORY_USER) delete payload.password;
      await api.post("/users/", payload);
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err, "Couldn't create the user."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add user" onClose={onClose}>
      <form onSubmit={handleSave}>
        <ErrorAlert message={error} />
        <div className="field">
          <label htmlFor="new-user-username">Username</label>
          <input id="new-user-username" type="text" autoComplete="username" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="new-user-role">Role</label>
          <select id="new-user-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value={ROLES.ADMINISTRATOR}>Administrator</option>
            <option value={ROLES.SECURITY_OFFICER}>Security Officer</option>
            <option value={ROLES.LABORATORY_USER}>Laboratory User</option>
          </select>
        </div>
        {form.role === ROLES.LABORATORY_USER ? (
          <p className="field-hint">Laboratory users enter through the access terminal and do not need a console password.</p>
        ) : (
          <div className="field">
            <label htmlFor="new-user-password">Temporary password</label>
            <input id="new-user-password" type="password" minLength={8} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Creating…" : "Create user"}</button>
        </div>
      </form>
    </Modal>
  );
}

function useResourceForFeed(endpoint) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!endpoint) {
      setData([]);
      setLoading(false);
      setDenied(false);
      setError("");
      return undefined;
    }

    let active = true;
    const refresh = () => api
      .get(endpoint)
      .then((res) => {
        if (!active) return;
        setError("");
        setDenied(false);
        const payload = res.data;
        const list = Array.isArray(payload) ? payload : payload.results || [];
        setData([...list].sort((a, b) =>
          new Date(b.timestamp || b.created_at) - new Date(a.timestamp || a.created_at)
        ));
      })
      .catch((err) => {
        if (!active) return;
        if (err.response?.status === 403) {
          setDenied(true);
        } else {
          setError(extractErrorMessage(err, "Couldn't load dashboard activity."));
        }
      })
      .finally(() => active && setLoading(false));
    refresh();
    const timer = window.setInterval(refresh, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [endpoint]);

  return { data, loading, denied, error };
}

function HardwareState({ label, state, tone, detail }) {
  return (
    <div className="hardware-state">
      <span className={`status-dot status-${tone}`} />
      <div><span className="hardware-label">{label}</span><strong>{state}</strong><small>{detail}</small></div>
    </div>
  );
}

function StatCard({ label, value, denied, tone, detail }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone}`}>{denied ? "—" : value === null ? "···" : value}</div>
      {detail && <div className="stat-detail">{detail}</div>}
    </div>
  );
}

function formatTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatEventType(type) {
  if (!type) return "Unknown event";
  return type
    .split("_")
    .map((w) => w[0] + w.slice(1).toLowerCase())
    .join(" ");
}
