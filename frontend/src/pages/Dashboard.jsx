import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { PageHead, Panel, ResultBadge, SeverityBadge, LoadingRow, EmptyState } from "../components/ui";

// Each card fetches independently and swallows 403s to "—" rather than
// failing the whole dashboard — a Laboratory User can't see security
// events (CanViewSecurityEvents), but should still see laboratory counts.
function useCount(endpoint) {
  const [count, setCount] = useState(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get(endpoint)
      .then((res) => {
        if (!active) return;
        const data = res.data;
        setCount(Array.isArray(data) ? data.length : data.count ?? data.results?.length ?? 0);
      })
      .catch((err) => {
        if (!active) return;
        if (err.response?.status === 403) setDenied(true);
        else setCount(0);
      });
    return () => {
      active = false;
    };
  }, [endpoint]);

  return { count, denied };
}

export default function Dashboard() {
  const labs = useCount("/laboratories/");
  const permissions = useCount("/access-permissions/");
  const events = useResourceForFeed("/authentication-events/");
  const security = useResourceForFeed("/security-events/");

  const grantedCount = Array.isArray(events.data)
    ? events.data.filter((e) => e.result === "GRANTED").length
    : null;
  const deniedCount = Array.isArray(events.data)
    ? events.data.filter((e) => e.result === "DENIED").length
    : null;
  const openSecurity = Array.isArray(security.data)
    ? security.data.filter((e) => !e.resolved).length
    : null;

  return (
    <>
      <PageHead
        eyebrow="Console / Overview"
        title="System status"
        sub="Live snapshot of laboratories, credentials, and recent access activity."
      />

      <div className="stat-grid">
        <StatCard label="Laboratories" value={labs.count} denied={labs.denied} tone="accent" />
        <StatCard label="Active Permissions" value={permissions.count} denied={permissions.denied} tone="accent" />
        <StatCard label="Recent — Granted" value={grantedCount} denied={events.denied} tone="granted" />
        <StatCard label="Recent — Denied" value={deniedCount} denied={events.denied} tone="denied" />
        <StatCard label="Unresolved Security Events" value={openSecurity} denied={security.denied} tone="warn" />
      </div>

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
                    <th>Face</th>
                    <th>Fingerprint</th>
                    <th>Result</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {events.data.slice(0, 6).map((ev) => (
                    <tr key={ev.id}>
                      <td>{ev.user_display || ev.user || "Unknown"}</td>
                      <td className="mono dim">{ev.face_verified ? "✓" : "—"}</td>
                      <td className="mono dim">{ev.fingerprint_verified ? "✓" : "—"}</td>
                      <td>
                        <ResultBadge result={ev.result} />
                      </td>
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
    </>
  );
}

function useResourceForFeed(endpoint) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get(endpoint)
      .then((res) => {
        if (!active) return;
        const payload = res.data;
        const list = Array.isArray(payload) ? payload : payload.results || [];
        setData([...list].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
      })
      .catch((err) => {
        if (!active) return;
        if (err.response?.status === 403) setDenied(true);
        else setData([]);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [endpoint]);

  return { data, loading, denied };
}

function StatCard({ label, value, denied, tone }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone}`}>{denied ? "—" : value === null ? "···" : value}</div>
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
