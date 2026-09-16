import { useEffect, useState } from "react";
import { useResourceList } from "../hooks/useResource";
import api, { extractErrorMessage } from "../api/client";
import {
  PageHead,
  Panel,
  BoolBadge,
  ErrorAlert,
  LoadingRow,
  EmptyState,
  PermissionDenied,
  Modal,
} from "../components/ui";

const EMPTY_FORM = { user: "", laboratory: "", is_allowed: true, valid_from: "", valid_until: "" };

export default function AccessPermissions() {
  const { items, loading, error, forbidden, create, update, remove } = useResourceList("/access-permissions/");
  const [labs, setLabs] = useState([]);
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    api
      .get("/laboratories/")
      .then((res) => setLabs(Array.isArray(res.data) ? res.data : res.data.results || []))
      .catch(() => setLabs([]));
    api
      .get("/users/")
      .then((res) => setUsers(Array.isArray(res.data) ? res.data : res.data.results || []))
      .catch(() => setUsers([]));
  }, []);

  function labName(id) {
    return labs.find((l) => l.id === id)?.name || `Lab #${id}`;
  }

  function openCreate() {
    setFormError("");
    setModal({ mode: "create", form: { ...EMPTY_FORM } });
  }

  function openEdit(perm) {
    setFormError("");
    setModal({
      mode: "edit",
      id: perm.id,
      form: {
        user: perm.user,
        laboratory: perm.laboratory,
        is_allowed: perm.is_allowed,
        valid_from: toLocalInput(perm.valid_from),
        valid_until: toLocalInput(perm.valid_until),
      },
    });
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const payload = {
        user: modal.form.user,
        laboratory: Number(modal.form.laboratory),
        is_allowed: modal.form.is_allowed,
        valid_from: modal.form.valid_from ? new Date(modal.form.valid_from).toISOString() : null,
        valid_until: modal.form.valid_until ? new Date(modal.form.valid_until).toISOString() : null,
      };
      if (modal.mode === "create") {
        await create(payload);
      } else {
        await update(modal.id, payload);
      }
      setModal(null);
    } catch (err) {
      setFormError(extractErrorMessage(err, "Couldn't save the permission."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(perm) {
    if (!confirm(`Revoke this permission?`)) return;
    setDeletingId(perm.id);
    try {
      await remove(perm.id);
    } catch (err) {
      alert(extractErrorMessage(err, "Couldn't revoke the permission."));
    } finally {
      setDeletingId(null);
    }
  }

  if (forbidden) {
    return (
      <>
        <PageHead eyebrow="Access Control" title="Access Permissions" />
        <PermissionDenied message={forbidden} />
      </>
    );
  }

  return (
    <>
      <PageHead
        eyebrow="Access Control"
        title="Access Permissions"
        sub="Which users may enter which laboratories, and the window each grant is valid for. Enforced by AuthenticateView on every scan."
        action={
          <button className="btn btn-primary" onClick={openCreate}>
            + Grant permission
          </button>
        }
      />

      <Panel>
        <ErrorAlert message={error} />
        {loading && <LoadingRow />}
        {!loading && items.length === 0 && !error && (
          <EmptyState glyph="✓" title="No access permissions granted yet." />
        )}
        {!loading && items.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Laboratory</th>
                  <th>Allowed</th>
                  <th>Valid From</th>
                  <th>Valid Until</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{p.user}</td>
                    <td>{labName(p.laboratory)}</td>
                    <td>
                      <BoolBadge value={p.is_allowed} trueLabel="ALLOWED" falseLabel="BLOCKED" />
                    </td>
                    <td className="mono dim">{p.valid_from ? new Date(p.valid_from).toLocaleString() : "Any time"}</td>
                    <td className="mono dim">{p.valid_until ? new Date(p.valid_until).toLocaleString() : "No expiry"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}>
                          Edit
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleDelete(p)}
                          disabled={deletingId === p.id}
                          style={{ color: "var(--denied)" }}
                        >
                          {deletingId === p.id ? "Revoking…" : "Revoke"}
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
        <Modal title={modal.mode === "create" ? "Grant access permission" : "Edit access permission"} onClose={() => setModal(null)}>
          <form onSubmit={handleSave}>
            <ErrorAlert message={formError} />
            <div className="form-grid">
              <div className="field">
                <label htmlFor="ap-user">Username</label>
                <select
                  id="ap-user"
                  required
                  value={modal.form.user}
                  onChange={(e) => setModal({ ...modal, form: { ...modal.form, user: e.target.value } })}
                >
                  <option value="" disabled>Select username…</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.username}>{user.username}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="ap-lab">Laboratory</label>
                <select
                  id="ap-lab"
                  required
                  value={modal.form.laboratory}
                  onChange={(e) => setModal({ ...modal, form: { ...modal.form, laboratory: e.target.value } })}
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
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="ap-from">Valid from</label>
                <input
                  id="ap-from"
                  type="datetime-local"
                  value={modal.form.valid_from}
                  onChange={(e) => setModal({ ...modal, form: { ...modal.form, valid_from: e.target.value } })}
                />
                <span className="field-hint">Leave blank for no start restriction.</span>
              </div>
              <div className="field">
                <label htmlFor="ap-until">Valid until</label>
                <input
                  id="ap-until"
                  type="datetime-local"
                  value={modal.form.valid_until}
                  onChange={(e) => setModal({ ...modal, form: { ...modal.form, valid_until: e.target.value } })}
                />
                <span className="field-hint">Leave blank for no expiry.</span>
              </div>
            </div>
            <div className="field checkbox-field" style={{ marginBottom: 6 }}>
              <input
                id="ap-allowed"
                type="checkbox"
                checked={modal.form.is_allowed}
                onChange={(e) => setModal({ ...modal, form: { ...modal.form, is_allowed: e.target.checked } })}
              />
              <label htmlFor="ap-allowed">Allowed — unchecked blocks access even within the valid window</label>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save permission"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

function toLocalInput(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
