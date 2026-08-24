import { useState } from "react";
import { useResourceList } from "../hooks/useResource";
import { extractErrorMessage } from "../api/client";
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

const EMPTY_FORM = { user: "", fingerprint_id: "", face_registered: false };

export default function BiometricProfiles() {
  const { items, loading, error, forbidden, create, update, remove } = useResourceList("/biometric-profiles/");
  const [modal, setModal] = useState(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  function openCreate() {
    setFormError("");
    setModal({ mode: "create", form: { ...EMPTY_FORM } });
  }

  function openEdit(profile) {
    setFormError("");
    setModal({
      mode: "edit",
      id: profile.id,
      form: {
        user: profile.user,
        fingerprint_id: profile.fingerprint_id ?? "",
        face_registered: profile.face_registered,
      },
    });
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const payload = {
        ...modal.form,
        user: Number(modal.form.user),
        fingerprint_id: modal.form.fingerprint_id === "" ? null : Number(modal.form.fingerprint_id),
      };
      if (modal.mode === "create") {
        await create(payload);
      } else {
        await update(modal.id, payload);
      }
      setModal(null);
    } catch (err) {
      setFormError(extractErrorMessage(err, "Couldn't save the biometric profile."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(profile) {
    if (!confirm(`Remove biometric profile for user #${profile.user}?`)) return;
    setDeletingId(profile.id);
    try {
      await remove(profile.id);
    } catch (err) {
      alert(extractErrorMessage(err, "Couldn't remove the profile."));
    } finally {
      setDeletingId(null);
    }
  }

  if (forbidden) {
    return (
      <>
        <PageHead eyebrow="Access Control" title="Biometric Profiles" />
        <PermissionDenied message={forbidden} />
      </>
    );
  }

  return (
    <>
      <PageHead
        eyebrow="Access Control"
        title="Biometric Profiles"
        sub="Which enrolled credentials (fingerprint, face) are on file for each Django user account. Manage user accounts themselves in /admin/."
        action={
          <button className="btn btn-primary" onClick={openCreate}>
            + Enroll profile
          </button>
        }
      />

      <Panel>
        <ErrorAlert message={error} />
        {loading && <LoadingRow />}
        {!loading && items.length === 0 && !error && (
          <EmptyState glyph="◉" title="No biometric profiles enrolled yet." />
        )}
        {!loading && items.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Fingerprint ID</th>
                  <th>Face Registered</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">#{p.user}</td>
                    <td className="mono dim">{p.fingerprint_id ?? "—"}</td>
                    <td>
                      <BoolBadge value={p.face_registered} />
                    </td>
                    <td className="mono dim">{p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}</td>
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
                          {deletingId === p.id ? "Removing…" : "Remove"}
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
        <Modal title={modal.mode === "create" ? "Enroll biometric profile" : "Edit biometric profile"} onClose={() => setModal(null)}>
          <form onSubmit={handleSave}>
            <ErrorAlert message={formError} />
            <div className="form-grid">
              <div className="field">
                <label htmlFor="bp-user">User ID</label>
                <input
                  id="bp-user"
                  type="number"
                  required
                  min="1"
                  value={modal.form.user}
                  onChange={(e) => setModal({ ...modal, form: { ...modal.form, user: e.target.value } })}
                />
                <span className="field-hint">Django auth user ID — one profile per user.</span>
              </div>
              <div className="field">
                <label htmlFor="bp-fp">Fingerprint ID</label>
                <input
                  id="bp-fp"
                  type="number"
                  min="0"
                  value={modal.form.fingerprint_id}
                  onChange={(e) => setModal({ ...modal, form: { ...modal.form, fingerprint_id: e.target.value } })}
                />
                <span className="field-hint">Optional — sensor-assigned template ID.</span>
              </div>
            </div>
            <div className="field checkbox-field" style={{ marginBottom: 6 }}>
              <input
                id="bp-face"
                type="checkbox"
                checked={modal.form.face_registered}
                onChange={(e) => setModal({ ...modal, form: { ...modal.form, face_registered: e.target.checked } })}
              />
              <label htmlFor="bp-face">Face template registered</label>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save profile"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
