import { useRef, useState, useEffect } from "react";
import api from "../api/client";
import { useResourceList } from "../hooks/useResource";
import { extractErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { ROLES } from "../auth/roles";
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

const EMPTY_FORM = { user: "", fingerprint_id: "" };

export default function BiometricProfiles() {
  const { user: currentUser } = useAuth();
  const isAdministrator = currentUser?.role === ROLES.ADMINISTRATOR;
  const { items, loading, error, forbidden, create, update, remove, reload } = useResourceList("/biometric-profiles/");
  const [modal, setModal] = useState(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [enrollUser, setEnrollUser] = useState(null);
  const [fingerprintUser, setFingerprintUser] = useState(null);
  const faceEnrolledCount = items.filter((profile) => profile.face_registered).length;
  const fingerprintEnrolledCount = items.filter((profile) => profile.fingerprint_id != null).length;
  const readyCount = items.filter(
    (profile) => profile.face_registered && profile.fingerprint_id != null
  ).length;

  function openCreate() {
    setFormError("");
    setModal({ mode: "create", form: { ...EMPTY_FORM }, faceRegistered: false });
  }

  function openEdit(profile) {
    setFormError("");
    setModal({
      mode: "edit",
      id: profile.id,
      faceRegistered: profile.face_registered,
      form: {
        user: profile.user,
        fingerprint_id: profile.fingerprint_id ?? "",
      },
    });
  }

  function openEnrollment(profile) {
    setEnrollUser(profile.user);
  }

  function openFingerprintEnrollment(profile) {
    setFingerprintUser({
      id: profile.user_id,
      username: profile.user,
    });
  }

  async function handleSave(e) {
    e.preventDefault();
    const enrollFace = e.nativeEvent.submitter?.value === "save-and-enroll-face";
    setSaving(true);
    setFormError("");
    try {
      const payload = {
        ...modal.form,
        fingerprint_id: modal.form.fingerprint_id === "" ? null : Number(modal.form.fingerprint_id),
      };
      let savedProfile;
      if (modal.mode === "create") {
        savedProfile = await create(payload);
      } else {
        savedProfile = await update(modal.id, payload);
      }
      setModal(null);
      if (enrollFace) setEnrollUser(savedProfile.user);
    } catch (err) {
      setFormError(extractErrorMessage(err, "Couldn't save the biometric profile."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(profile) {
    if (!confirm(`Remove biometric profile for ${profile.user}?`)) return;
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
        sub={isAdministrator
          ? "Credential coverage and enrollment status for each user. Only administrators can enroll or change biometric records."
          : "Credential coverage and enrollment status for each user. This view is read-only for security staff."}
        action={isAdministrator && (
          <button className="btn btn-primary" onClick={openCreate}>
            + Enroll profile
          </button>
        )}
      />

      <div className="stat-grid">
        <ProfileStat label="Profiles" value={items.length} loading={loading} />
        <ProfileStat label="Face enrolled" value={faceEnrolledCount} loading={loading} />
        <ProfileStat label="Fingerprint enrolled" value={fingerprintEnrolledCount} loading={loading} />
        <ProfileStat label="Complete credentials" value={`${readyCount}/${items.length}`} loading={loading} />
      </div>

      <Panel>
        <ErrorAlert message={error} />
        {!isAdministrator && (
          <div className="read-only-note">
            <span className="insight-label">Read-only access</span>
            <span>Contact an administrator to register users or enroll and update biometric credentials.</span>
          </div>
        )}
        {loading && <LoadingRow />}
        {!loading && items.length === 0 && !error && (
          <EmptyState glyph="◉" title="No biometric profiles enrolled yet." />
        )}
        {!loading && items.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Fingerprint ID</th>
                  <th>Face Registered</th>
                  <th>Created</th>
                  {isAdministrator && <th></th>}
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{p.user}</td>
                    <td className="mono dim">{p.fingerprint_id ?? "—"}</td>
                    <td>
                      <BoolBadge value={p.face_registered} />
                    </td>
                    <td className="mono dim">{p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}</td>
                    {isAdministrator && <td>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}>
                          Edit
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEnrollment(p)}>
                          {p.face_registered ? "Retake face" : "Enroll face"}
                        </button>
                        {p.fingerprint_id == null ? (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => openFingerprintEnrollment(p)}
                          >
                            Enroll fingerprint
                          </button>
                        ) : (
                          <span className="dim">Fingerprint enrolled</span>
                        )}
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleDelete(p)}
                          disabled={deletingId === p.id}
                          style={{ color: "var(--denied)" }}
                        >
                          {deletingId === p.id ? "Removing…" : "Remove"}
                        </button>
                      </div>
                    </td>}
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
                <label htmlFor="bp-user">Username</label>
                <input
                  id="bp-user"
                  type="text"
                  required
                  autoComplete="username"
                  value={modal.form.user}
                  onChange={(e) => setModal({ ...modal, form: { ...modal.form, user: e.target.value } })}
                />
                <span className="field-hint">Enter an existing Django username; each user has one profile.</span>
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
            <div className="field profile-face-enrollment">
              <label>Face recognition enrollment</label>
              <p>
                {modal.faceRegistered
                  ? "A face sample is enrolled. You can capture a replacement after saving."
                  : currentUser?.role === ROLES.ADMINISTRATOR
                    ? "Not enrolled yet. Save the profile and continue to camera capture."
                    : "Not enrolled yet. An administrator must complete camera enrollment."}
              </p>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button type="submit" className="btn" value="save-profile" disabled={saving}>
                {saving ? "Saving…" : "Save profile"}
              </button>
              {currentUser?.role === ROLES.ADMINISTRATOR && (
                <button type="submit" className="btn btn-primary" value="save-and-enroll-face" disabled={saving}>
                  {saving ? "Saving…" : modal.faceRegistered ? "Save & retake face" : "Save & enroll face"}
                </button>
              )}
            </div>
          </form>
        </Modal>
      )}
      {enrollUser && <FaceEnrollmentModal username={enrollUser} onClose={() => setEnrollUser(null)} onEnrolled={reload} />}
      {fingerprintUser && (
        <FingerprintEnrollmentModal
          user={fingerprintUser}
          onClose={() => setFingerprintUser(null)}
          onEnrolled={reload}
        />
      )}
    </>
  );
}

function ProfileStat({ label, value, loading }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value accent">{loading ? "···" : value}</div>
    </div>
  );
}

function FaceEnrollmentModal({ username, onClose, onEnrolled }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  async function startCamera() {
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      videoRef.current.srcObject = streamRef.current;
      await videoRef.current.play();
    } catch {
      setError("Camera access is required for face enrollment.");
    }
  }

  async function capture() {
    const video = videoRef.current;
    if (!video?.videoWidth) return setError("Start the camera before capturing.");
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    setSaving(true);
    setError("");
    try {
      await api.post("/face-enroll/", { username, face_image: canvas.toDataURL("image/jpeg", 0.85) });
      await onEnrolled();
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err, "The face could not be enrolled."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Enroll face for ${username}`} onClose={onClose}>
      <ErrorAlert message={error} />
      <video ref={videoRef} muted playsInline style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", background: "#101820" }} />
      <div className="modal-actions">
        <button type="button" className="btn" onClick={startCamera}>Start camera</button>
        <button type="button" className="btn btn-primary" onClick={capture} disabled={saving}>{saving ? "Enrolling…" : "Capture and enroll"}</button>
      </div>
    </Modal>
  );
}

function FingerprintEnrollmentModal({ user, onClose, onEnrolled }) {
  const [status, setStatus] = useState({
    result: "IDLE",
    message: "Ready to start fingerprint enrollment.",
  });
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [started, setStarted] = useState(false);

  function normalizeResult(result) {
    return (result || "").replace(/^ENROLL_/, "").toUpperCase();
  }

  function getInstruction(result) {
    switch (normalizeResult(result)) {
      case "WAITING_FIRST_FINGER":
        return "Place your finger on the scanner for the first scan.";

      case "WAITING_FOR_REMOVAL":
        return "First scan captured. Remove your finger from the scanner.";

      case "WAITING_SECOND_FINGER":
        return "Place the same finger on the scanner for the second scan.";

      case "COMPLETED":
        return `Fingerprint enrolled successfully. ID: ${status.fingerprint_id}.`;

      case "FAILED":
        return status.message || "Fingerprint enrollment failed.";

      case "IDLE":
        return "Ready to start fingerprint enrollment.";

      default:
        return status.message || "Waiting for the fingerprint scanner...";
    }
  }

  async function handleStart() {
    setStarting(true);
    setError("");

    try {
      const response = await api.post(
        "/fingerprint-enrollment/start/",
        { user_id: user.id }
      );

      setStatus(response.data);

      const result = normalizeResult(response.data.result);

      if (["FAILED", "ERROR"].includes(result)) {
        setError(response.data.message || "Could not start enrollment.");
        return;
      }

      setStarted(true);
      setPolling(true);
    } catch (err) {
      setError(
        extractErrorMessage(err, "Could not start fingerprint enrollment.")
      );
    } finally {
      setStarting(false);
    }
  }

  useEffect(() => {
    if (!polling) return;

    let cancelled = false;
    let timeoutId;

    async function checkStatus() {
      try {
        const response = await api.get(
          "/fingerprint-enrollment/status/"
        );

        if (cancelled) return;

        const data = response.data;
        const result = normalizeResult(data.result);

        setStatus(data);

        if (result === "COMPLETED") {
          setPolling(false);
          setStarted(false);

          try {
            await onEnrolled();
          } catch {
            setError(
              "Enrollment succeeded, but the profile list could not be refreshed."
            );
          }

          return;
        }

        if (result === "FAILED" || result === "ERROR") {
          setPolling(false);
          setStarted(false);
          return;
        }

        if (result === "IDLE") {
          setPolling(false);
          setStarted(false);
          setError(
            "No active enrollment was found. Start enrollment again."
          );
          return;
        }

        timeoutId = setTimeout(checkStatus, 1000);
      } catch (err) {
        if (cancelled) return;

        setPolling(false);
        setStarted(false);
        setError(
          extractErrorMessage(err, "Could not check enrollment status.")
        );
      }
    }

    timeoutId = setTimeout(checkStatus, 500);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [polling, onEnrolled]);

  async function handleCancel() {
    if (started) {
      try {
        await api.delete("/fingerprint-enrollment/cancel/");
      } catch (err) {
        setError(
          extractErrorMessage(err, "Could not cancel enrollment.")
        );
        return;
      }
    }

    setPolling(false);
    onClose();
  }

  const result = normalizeResult(status.result);
  const completed = result === "COMPLETED";
  const failed = result === "FAILED" || result === "ERROR";

  return (
    <Modal
      title={`Enroll fingerprint for ${user.username}`}
      onClose={handleCancel}
    >
      <ErrorAlert message={error} />

      <div className="field">
        <label>Selected user</label>
        <p className="mono">{user.username}</p>
      </div>

      <div className="field">
        <label>Scanner status</label>
        <p>{getInstruction(result)}</p>
        {status.fingerprint_id > 0 && (
          <p>
            Fingerprint ID:{" "}
            <strong>{status.fingerprint_id}</strong>
          </p>
        )}
      </div>

      {!started && !completed && (
        <div className="modal-actions">
          <button
            type="button"
            className="btn"
            onClick={handleCancel}
            disabled={starting}
          >
            Cancel
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleStart}
            disabled={starting}
          >
            {starting ? "Starting…" : "Start enrollment"}
          </button>
        </div>
      )}

      {started && !completed && (
        <div className="modal-actions">
          <button
            type="button"
            className="btn"
            onClick={handleCancel}
          >
            Cancel enrollment
          </button>
        </div>
      )}

      {completed && (
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      )}

      {failed && (
        <div className="modal-actions">
          <button
            type="button"
            className="btn"
            onClick={handleCancel}
          >
            Close
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleStart}
            disabled={starting}
          >
            Try again
          </button>
        </div>
      )}
    </Modal>
  );
}
