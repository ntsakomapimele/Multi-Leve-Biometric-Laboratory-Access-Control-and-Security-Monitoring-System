import { useMemo, useState } from "react";
import { useResourceList } from "../hooks/useResource";
import { extractErrorMessage } from "../api/client";
import { PageHead, Panel, ResultBadge, ErrorAlert, LoadingRow, EmptyState, PermissionDenied } from "../components/ui";

const FILTERS = [
  { key: "ALL", label: "All" },
  { key: "GRANTED", label: "Granted" },
  { key: "DENIED", label: "Denied" },
];

export default function AuthenticationEvents() {
  const { items, loading, error, forbidden, remove } = useResourceList("/authentication-events/");
  const [filter, setFilter] = useState("ALL");
  const [deletingId, setDeletingId] = useState(null);

  const sorted = useMemo(
    () => [...items].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
    [items]
  );
  const filtered = filter === "ALL" ? sorted : sorted.filter((e) => e.result === filter);

  async function handleDelete(ev) {
    if (!confirm("Delete this log entry? This cannot be undone.")) return;
    setDeletingId(ev.id);
    try {
      await remove(ev.id);
    } catch (err) {
      alert(extractErrorMessage(err, "Couldn't delete the entry."));
    } finally {
      setDeletingId(null);
    }
  }

  if (forbidden) {
    return (
      <>
        <PageHead eyebrow="Monitoring" title="Authentication Log" />
        <PermissionDenied message={forbidden} />
      </>
    );
  }

  return (
    <>
      <PageHead
        eyebrow="Monitoring"
        title="Authentication Log"
        sub="Access-terminal decisions and administrator reader tests, with verification details and recorded denial reasons."
      />

      <Panel>
        <div className="toolbar">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className="btn btn-sm"
              onClick={() => setFilter(f.key)}
              style={
                filter === f.key
                  ? { background: "var(--accent-soft)", borderColor: "var(--accent)", color: "var(--accent)" }
                  : undefined
              }
            >
              {f.label}
            </button>
          ))}
          <div className="toolbar-spacer" />
          <span className="faint mono" style={{ fontSize: 11.5 }}>
            {filtered.length} record{filtered.length === 1 ? "" : "s"}
          </span>
        </div>

        <ErrorAlert message={error} />
        {loading && <LoadingRow />}
        {!loading && filtered.length === 0 && !error && <EmptyState glyph="≡" title="No matching authentication events." />}
        {!loading && filtered.length > 0 && (
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
                  <th>Source</th>
                  <th>Timestamp</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((ev) => (
                  <tr key={ev.id}>
                    <td>{ev.user_display || (ev.user != null ? `#${ev.user}` : "Unknown user")}</td>
                    <td>{ev.laboratory_display || "Unknown laboratory"}</td>
                    <td className="mono dim">{ev.face_verified ? "✓ verified" : "— none"}</td>
                    <td className="mono dim">{ev.fingerprint_verified ? "✓ verified" : "— none"}</td>
                    <td>
                      <ResultBadge result={ev.result} />
                    </td>
                    <td className="dim">{ev.denial_reason || "All checks passed"}</td>
                    <td><span className="badge badge-neutral">{ev.source === "READER_TEST" ? "TEST" : "TERMINAL"}</span></td>
                    <td className="mono dim">{new Date(ev.timestamp).toLocaleString()}</td>
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleDelete(ev)}
                        disabled={deletingId === ev.id}
                        style={{ color: "var(--denied)" }}
                      >
                        {deletingId === ev.id ? "…" : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
