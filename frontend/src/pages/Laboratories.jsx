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

const EMPTY_FORM = { name: "", location: "", description: "", is_active: true };

export default function Laboratories() {
  const { items, loading, error, forbidden, create, update, remove } = useResourceList("/laboratories/");
  const [modal, setModal] = useState(null); // { mode: "create"|"edit", form, id }
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  function openCreate() {
    setFormError("");
    setModal({ mode: "create", form: { ...EMPTY_FORM } });
  }

  function openEdit(lab) {
    setFormError("");
    setModal({
      mode: "edit",
      id: lab.id,
      form: {
        name: lab.name,
        location: lab.location,
        description: lab.description || "",
        is_active: lab.is_active,
      },
    });
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      if (modal.mode === "create") {
        await create(modal.form);
      } else {
        await update(modal.id, modal.form);
      }
      setModal(null);
    } catch (err) {
      setFormError(extractErrorMessage(err, "Couldn't save the laboratory."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(lab) {
    if (!confirm(`Remove "${lab.name}"? This cannot be undone.`)) return;
    setDeletingId(lab.id);
    try {
      await remove(lab.id);
    } catch (err) {
      alert(extractErrorMessage(err, "Couldn't remove the laboratory."));
    } finally {
      setDeletingId(null);
    }
  }

  if (forbidden) {
    return (
      <>
        <PageHead eyebrow="Access Control" title="Laboratories" />
        <PermissionDenied message={forbidden} />
      </>
    );
  }

  return (
    <>
      <PageHead
        eyebrow="Access Control"
        title="Laboratories"
        sub="Rooms and spaces the access-control system protects. Write access requires the Administrator group."
        action={
          <button className="btn btn-primary" onClick={openCreate}>
            + Register laboratory
          </button>
        }
      />

      <Panel>
        <ErrorAlert message={error} />
        {loading && <LoadingRow />}
        {!loading && items.length === 0 && !error && (
          <EmptyState glyph="▢" title="No laboratories registered yet." hint="Register one to start assigning access permissions." />
        )}
        {!loading && items.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Location</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((lab) => (
                  <tr key={lab.id}>
                    <td style={{ fontWeight: 600 }}>{lab.name}</td>
                    <td className="dim">{lab.location}</td>
                    <td className="dim">{lab.description || "—"}</td>
                    <td>
                      <BoolBadge value={lab.is_active} trueLabel="ACTIVE" falseLabel="INACTIVE" />
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(lab)}>
                          Edit
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleDelete(lab)}
                          disabled={deletingId === lab.id}
                          style={{ color: "var(--denied)" }}
                        >
                          {deletingId === lab.id ? "Removing…" : "Remove"}
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
        <Modal title={modal.mode === "create" ? "Register laboratory" : "Edit laboratory"} onClose={() => setModal(null)}>
          <form onSubmit={handleSave}>
            <ErrorAlert message={formError} />
            <div className="form-grid">
              <div className="field">
                <label htmlFor="lab-name">Name</label>
                <input
                  id="lab-name"
                  type="text"
                  required
                  value={modal.form.name}
                  onChange={(e) => setModal({ ...modal, form: { ...modal.form, name: e.target.value } })}
                />
              </div>
              <div className="field">
                <label htmlFor="lab-location">Location</label>
                <input
                  id="lab-location"
                  type="text"
                  required
                  value={modal.form.location}
                  onChange={(e) => setModal({ ...modal, form: { ...modal.form, location: e.target.value } })}
                />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 16 }}>
              <label htmlFor="lab-desc">Description</label>
              <textarea
                id="lab-desc"
                rows={3}
                value={modal.form.description}
                onChange={(e) => setModal({ ...modal, form: { ...modal.form, description: e.target.value } })}
              />
            </div>
            <div className="field checkbox-field" style={{ marginBottom: 6 }}>
              <input
                id="lab-active"
                type="checkbox"
                checked={modal.form.is_active}
                onChange={(e) => setModal({ ...modal, form: { ...modal.form, is_active: e.target.checked } })}
              />
              <label htmlFor="lab-active">Active — permits reader authentication</label>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save laboratory"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
