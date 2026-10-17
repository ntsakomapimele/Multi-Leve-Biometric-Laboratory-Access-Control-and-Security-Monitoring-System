import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api, { extractErrorMessage } from "../api/client";

const EMPTY_STEPS = [
  { label: "Face match", detail: "Awaiting camera scan", state: "pending" },
  { label: "Fingerprint reader", detail: "Hardware offline", state: "offline" },
  { label: "Lab authorization", detail: "Awaiting identity check", state: "pending" },
];

export default function AccessTerminal() {
  const [laboratories, setLaboratories] = useState([]);
  const [username, setUsername] = useState("");
  const [laboratoryId, setLaboratoryId] = useState("");
  const [faceImage, setFaceImage] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [scanError, setScanError] = useState("");
  const [steps, setSteps] = useState(EMPTY_STEPS);
  const [result, setResult] = useState(null);
  const [cameraState, setCameraState] = useState("offline");
  const [submitting, setSubmitting] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [fingerprintToken, setFingerprintToken] = useState("");
  const [fingerprintStatus, setFingerprintStatus] = useState("Not scanned");
  const [fingerprintLoading, setFingerprintLoading] = useState(false);

  useEffect(() => {
    api.get("/laboratories/")
      .then((response) => {
        const list = Array.isArray(response.data) ? response.data : response.data.results || [];
        setLaboratories(list.filter((lab) => lab.is_active));
      })
      .catch(() => setScanError("Laboratory list is unavailable."));
    return () => streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function startCamera() {
    setCameraError("");
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      videoRef.current.srcObject = streamRef.current;
      await videoRef.current.play();
      setCameraState("online");
    } catch {
      setCameraState("offline");
      setCameraError("Camera unavailable. Allow camera access and try again.");
    }
  }

  function captureFace() {
    const video = videoRef.current;
    if (!video?.videoWidth) {
      setCameraError("Start the camera before capturing.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    setFaceImage(canvas.toDataURL("image/jpeg", 0.85));
    setCameraError("");
    setScanError("");
    setResult(null);
    setSteps([
      { label: "Face match", detail: "Image captured; server verification pending", state: "ready" },
      { label: "Fingerprint reader", detail: "Hardware offline", state: "offline" },
      { label: "Lab authorization", detail: "Awaiting identity check", state: "pending" },
    ]);
  }

  

  async function runScan(event) {
    event.preventDefault();
    if (!fingerprintToken) {
      setFingerprintStatus("Scan your fingerprint before authenticating.");
      return;
    }

    setScanError("");
    setResult(null);
    setSubmitting(true);
    setSteps([
      { label: "Face match", detail: "Verifying against enrolled profile", state: "active" },
      { label: "Fingerprint reader", detail: "Fingerprint verified", state: "success" },
      { label: "Lab authorization", detail: "Checking access window", state: "active" },
    ]);

    try {
      const response = await api.post("/authenticate/", {
        username,
        laboratory_id: Number(laboratoryId),
        face_image: faceImage,
        fingerprint_token: fingerprintToken,
      });
      setResult(response.data);
      setScanSteps(response.data);
    } catch (error) {
      if (error.response?.data?.result) {
        setResult(error.response.data);
        setScanSteps(error.response.data);
      } else {
        setScanError(extractErrorMessage(error, "The access check could not be completed."));
        setSteps(EMPTY_STEPS);
      }
    } finally {
      setSubmitting(false);
      setFingerprintToken("");
      setFingerprintStatus("Scan again before the next access check.");
    }
  }
const scanFingerprint = async () => {
  if (!laboratoryId) {
    setFingerprintStatus("Select a laboratory first.");
    return;
  }

  setFingerprintLoading(true);
  setFingerprintToken("");
  setFingerprintStatus("Waiting for fingerprint...");

  try {
    const response = await api.post("/fingerprint-scan/", {
      laboratory_id: Number(laboratoryId),
    });

    setFingerprintToken(response.data.fingerprint_token);
    setUsername(response.data.username);
    setFingerprintStatus(
      `Fingerprint matched for ${response.data.username}. Verify face next.`
    );
  } catch (error) {
    const message =
      error.response?.data?.message ||
      error.response?.data?.detail ||
      "Fingerprint scan failed. Check the device connection and try again.";

    setFingerprintStatus(message);
    setFingerprintToken("");
  } finally {
    setFingerprintLoading(false);
  }
};
  function setScanSteps(data) {
    setSteps([
      {
        label: "Face match",
        detail: data.checks?.face_verified ? "Matched enrolled profile" : "No enrolled face match",
        state: data.checks?.face_verified ? "success" : "failed",
      },
      {
        label: "Fingerprint reader",
        detail: data.checks?.fingerprint_verified ? "Fingerprint verified" : "Fingerprint not verified",
        state: data.checks?.fingerprint_verified ? "success" : "failed",
      },
      {
        label: "Lab authorization",
        detail: data.checks?.permission_active ? "Active permission found" : "No active permission",
        state: data.checks?.permission_active ? "success" : "failed",
      },
    ]);
  }

  return (
    <div className="terminal-shell">
      <header className="terminal-header">
        <Link to="/" className="terminal-brand"><span className="brand-mark" />SentryLab <span>/ ACCESS TERMINAL</span></Link>
        <div className="terminal-device-state">
          <span className="status-dot status-warning" />
          <span>TEST MODE</span>
          <span className="terminal-divider" />
          <span>DOOR CONTROLLER OFFLINE</span>
          <Link to="/" className="terminal-exit">Exit terminal</Link>
        </div>
      </header>

      <main className="terminal-main">
        <div className="terminal-intro">
          <p className="page-eyebrow">LABORATORY ENTRY</p>
          <h1>Identity verification</h1>
          <p>Complete the identity and laboratory checks to record an access decision.</p>
        </div>

        <div className="terminal-grid">
          <section className="terminal-camera-panel">
            <div className="terminal-panel-head">
              <div><span className="terminal-kicker">01 / BIOMETRIC INPUT</span><h2>Face verification</h2></div>
              <span className={`device-chip ${cameraState}`}><span className="status-dot" />CAMERA {cameraState.toUpperCase()}</span>
            </div>
            <div className={`terminal-camera${faceImage ? " captured" : ""}`}>
              <video ref={videoRef} muted playsInline />
              {!cameraState || cameraState === "offline" ? <div className="camera-placeholder"><span className="camera-crosshair">+</span><span>Camera feed is not active</span></div> : null}
              {faceImage && <div className="capture-label"><span className="status-dot status-good" />FRAME CAPTURED</div>}
            </div>
            {cameraError && <p className="terminal-error">{cameraError}</p>}
            <div className="terminal-actions">
              <button className="btn" type="button" onClick={startCamera}>Start camera</button>
              <button className="btn btn-primary" type="button" onClick={captureFace} disabled={cameraState !== "online"}>Capture face</button>
            </div>
            <div className="fingerprint-action">
              <div>
                <h3>Fingerprint verification</h3>
                <p>Select a laboratory, then scan at the fingerprint reader. A successful match fills the account username.</p>
              </div>
              <button
                className="btn btn-primary"
                type="button"
                onClick={scanFingerprint}
                disabled={fingerprintLoading || !laboratoryId}
              >
                {fingerprintLoading ? "Waiting for fingerprint…" : "Scan fingerprint"}
              </button>
              <p className="fingerprint-status" aria-live="polite">{fingerprintStatus}</p>
            </div>
            <p className="terminal-note">Face images are checked by the server against the selected account’s enrolled profile.</p>
          </section>

          <section className="terminal-checks-panel">
            <span className="terminal-kicker">02 / ACCESS DECISION</span>
            <h2>Reader sequence</h2>
            <ol className="reader-sequence">
              {steps.map((step, index) => (
                <li key={step.label} className={`reader-step ${step.state}`}>
                  <span className="reader-step-index">{step.state === "success" ? "✓" : step.state === "failed" ? "×" : String(index + 1).padStart(2, "0")}</span>
                  <div><strong>{step.label}</strong><span>{step.detail}</span></div>
                  <span className="reader-step-state">{step.state === "offline" ? "OFFLINE" : step.state.toUpperCase()}</span>
                </li>
              ))}
            </ol>

            <form onSubmit={runScan} className="terminal-form">
              <div className="field">
                <label htmlFor="terminal-username">Account username</label>
                <input id="terminal-username" type="text" required autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="terminal-lab">Destination laboratory</label>
                <select id="terminal-lab" required value={laboratoryId} onChange={(event) => setLaboratoryId(event.target.value)}>
                  <option value="" disabled>Select laboratory…</option>
                  {laboratories.map((lab) => <option key={lab.id} value={lab.id}>{lab.name} · {lab.location}</option>)}
                </select>
              </div>
              {scanError && <p className="terminal-error">{scanError}</p>}
              <button className="btn btn-primary terminal-submit" type="submit" disabled={submitting || !faceImage || !laboratoryId || !username}>
                {submitting ? "Checking credentials…" : "Verify access"}
              </button>
            </form>
          </section>
        </div>

        {result && (
          <section className={`terminal-decision ${result.result === "GRANTED" ? "granted" : "denied"}`} aria-live="polite">
            <div className="decision-icon">{result.result === "GRANTED" ? "✓" : "×"}</div>
            <div className="decision-copy">
              <span className="terminal-kicker">ACCESS DECISION · {new Date().toLocaleTimeString()}</span>
              <h2>{result.result === "GRANTED" ? "Access decision granted" : "Access denied"}</h2>
              <p>{result.denial_reason || result.message}</p>
              <span className="door-disclaimer">DOOR RELEASE NOT AVAILABLE · NO CONTROLLER CONNECTED</span>
            </div>
            <button className="btn" type="button" onClick={() => { setResult(null); setFaceImage(""); setFingerprintToken(""); setFingerprintStatus("Not scanned"); setSteps(EMPTY_STEPS); }}>New check</button>
          </section>
        )}
      </main>
      <footer className="terminal-footer"><span>ACCESS CONTROL SYSTEM</span><span>BIOMETRIC PROCESSING · LOCAL SERVER</span><span>NO DOOR ACTUATION</span></footer>
    </div>
  );
}

