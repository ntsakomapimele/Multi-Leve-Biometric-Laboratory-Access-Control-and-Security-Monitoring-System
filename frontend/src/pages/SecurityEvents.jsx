import { useEffect, useMemo, useState } from "react";
import { useResourceList } from "../hooks/useResource";
import api, { extractErrorMessage } from "../api/client";
import {
  PageHead,
  Panel,
  SeverityBadge,
  BoolBadge,
  ErrorAlert,
  LoadingRow,
  EmptyState,
  PermissionDenied,
  Modal,
} from "../components/ui";

const EVENT_TYPES = [
  ["FORCED_ENTRY", "Forced Entry"],
  ["DOOR_LEFT_OPEN", "Door Left Open"],
  ["UNKNOWN_FACE", "Unknown Face"],
  ["FAILED_AUTH", "Failed Authentication"],
  ["SYSTEM_ALERT", "System Alert"],
];
const SEVERITIES = ["LOW", "MEDIUM", "HIGH"];

const EMPTY_FORM = { laboratory: "", event_type: "SYSTEM_ALERT", description: "", severity: "LOW" };

export default function SecurityEvents() {
  const { items, loading, error, forbidden, create, update, remove } = useResourceList("/security-events/");
  const [labs, setLabs] = useState([]);
  const [modal, setModal] = useState(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showResolved, setShowResolved] = useState(true);

  useEffect(() => {
    api
      .get("/laboratories/")
      .then((res) => setLabs(Array.isArray(res.data) ? res.data : res.data.results || []))
      .catch(() => setLabs([]));
  }, []);

  function labName(id) {
    return labs.find((l) => l.id === id)?.name || `Lab #${id}`;
  }

  const sorted = useMemo(
    () => [...items].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
    [items]
  );
  const visible = showResolved ? sorted : sorted.filter((e) => !e.resolved);

  function openCreate() {
    setFormError("");
    setModal({ form: { ...EMPTY_FORM } });
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      await create({ ...modal.form, laboratory: Number(modal.form.laboratory) });
      setModal(null);
    } catch (err) {
      setFormError(extractErrorMessage(err, "Couldn't log the security event."));
    } finally {
      setSaving(false);
    }
  }

  async function toggleResolved(ev) {
    try {
      await update(ev.id, { resolved: !ev.resolved });
    } catch (err) {
      alert(extractErrorMessage(err, "Couldn't update the event."));
    }
  }

  async function handleDelete(ev) {
    if (!confirm("Delete this security event?")) return;
    try {
      await remove(ev.id);
    } catch (err) {
      alert(extractErrorMessage(err, "Couldn't delete the event."));
    }
  }

  if (forbidden) {
    return (
      <>
        <PageHead eyebrow="Monitoring" title="Security Events" />
        <PermissionDenied message={forbidden} />
      </>
    );
  }

  return (
    <>
      <PageHead
        eyebrow="Monitoring"
        title="Security Events"
        sub="Forced-entry alarms, unknown faces, and other alerts raised across the monitored laboratories."
        action={
          <button className="btn btn-primary" onClick={openCreate}>
            + Log security event
          </button>
        }
      />

      <Panel>
        <div className="toolbar">
          <button
            className="btn btn-sm"
            onClick={() => setShowResolved((s) => !s)}
            style={
              !showResolved
                ? { background: "var(--accent-soft)", borderColor: "var(--accent)", color: "var(--accent)" }
                : undefined
            }
          >
            {showResolved ? "Showing all" : "Unresolved only"}
          </button>
          <div className="toolbar-spacer" />
          <span className="faint mono" style={{ fontSize: 11.5 }}>
            {visible.length} record{visible.length === 1 ? "" : "s"}
          </span>
        </div>

        <ErrorAlert message={error} />
        {loading && <LoadingRow />}
        {!loading && visible.length === 0 && !error && <EmptyState glyph="!" title="No security events to show." />}
        {!loading && visible.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Laboratory</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Severity</th>
                  <th>Resolved</th>
                  <th>Time</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((ev) => (
                  <tr key={ev.id}>
                    <td>{labName(ev.laboratory)}</td>
                    <td>{eventTypeLabel(ev.event_type)}</td>
                    <td className="dim" style={{ maxWidth: 260 }}>
                      {ev.description}
                    </td>
                    <td>
                      <SeverityBadge severity={ev.severity} />
                    </td>
                    <td>
                      <BoolBadge value={ev.resolved} trueLabel="RESOLVED" falseLabel="OPEN" />
                    </td>
                    <td className="mono dim">{new Date(ev.timestamp).toLocaleString()}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => toggleResolved(ev)}>
                          {ev.resolved ? "Reopen" : "Resolve"}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(ev)} style={{ color: "var(--denied)" }}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {modal && (
        <Modal title="Log security event" onClose={() => setModal(null)}>
          <form onSubmit={handleSave}>
            <ErrorAlert message={formError} />
            <div className="form-grid">
              <div className="field">
                <label htmlFor="se-lab">Laboratory</label>
                <select
                  id="se-lab"
                  required
                  value={modal.form.laboratory}
                  onChange={(e) => setModal({ form: { ...modal.form, laboratory: e.target.value } })}
                >
                  <option value="" disabled>
                    Select laboratory…
                  </option>
                  {labs.map((lab) => (
                    <option key={lab.id} value={lab.id}>
                      {lab.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="se-type">Event type</label>
                <select
                  id="se-type"
                  value={modal.form.event_type}
                  onChange={(e) => setModal({ form: { ...modal.form, event_type: e.target.value } })}
                >
                  {EVENT_TYPES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field" style={{ marginBottom: 14 }}>
              <label htmlFor="se-desc">Description</label>
              <textarea
                id="se-desc"
                rows={3}
                required
                value={modal.form.description}
                onChange={(e) => setModal({ form: { ...modal.form, description: e.target.value } })}
              />
            </div>
            <div className="field" style={{ marginBottom: 6 }}>
              <label htmlFor="se-sev">Severity</label>
              <select
                id="se-sev"
                value={modal.form.severity}
                onChange={(e) => setModal({ form: { ...modal.form, severity: e.target.value } })}
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Logging…" : "Log event"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

function eventTypeLabel(type) {
  return EVENT_TYPES.find(([value]) => value === type)?.[1] || type;
}
