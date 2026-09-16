import { useEffect, useRef, useState } from "react";
import api, { extractErrorMessage } from "../api/client";
import { PageHead, Panel, ErrorAlert } from "../components/ui";

export default function Authenticate() {
  const [labs, setLabs] = useState([]);
  const [username, setUsername] = useState("");
  const [laboratoryId, setLaboratoryId] = useState("");
  const [faceVerified, setFaceVerified] = useState(false);
  const [faceImage, setFaceImage] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [fingerprintVerified, setFingerprintVerified] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/laboratories/")
      .then((res) => setLabs(Array.isArray(res.data) ? res.data : res.data.results || []))
      .catch(() => setLabs([]));
  }, []);

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  async function startCamera() {
    setError("");
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      videoRef.current.srcObject = streamRef.current;
      await videoRef.current.play();
    } catch {
      setError("Camera access is required for facial verification.");
    }
  }

  function captureFace() {
    const video = videoRef.current;
    if (!video?.videoWidth) return setError("Start the camera before capturing your face.");
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    setFaceImage(canvas.toDataURL("image/jpeg", 0.85));
    setFaceVerified(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setResult(null);
    try {
      const res = await api.post("/authenticate/", {
        username,
        laboratory_id: Number(laboratoryId),
        face_verified: faceVerified,
        face_image: faceImage,
        fingerprint_verified: fingerprintVerified,
      });
      setResult(res.data);
    } catch (err) {
      // AuthenticateView returns a structured GRANTED/DENIED body even on
      // 403/404, so surface that instead of a generic error where possible.
      if (err.response?.data?.result) {
        setResult(err.response.data);
      } else {
        setError(extractErrorMessage(err, "The authentication request failed."));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Console"
        title="Simulate Scan"
        sub="Drives the same AuthenticateView the physical reader hits — useful for testing permissions and biometric enrollment without hardware."
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }} className="dash-grid">
        <Panel accent title="Reader input" sub="Enter the credentials the badge station would report.">
          <form onSubmit={handleSubmit}>
            <ErrorAlert message={error} />
            <div className="field" style={{ marginBottom: 14 }}>
              <label>Face camera</label>
              <video ref={videoRef} muted playsInline style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", background: "#101820" }} />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button type="button" className="btn btn-sm" onClick={startCamera}>Start camera</button>
                <button type="button" className="btn btn-sm" onClick={captureFace}>Capture face</button>
              </div>
              <span className="field-hint">Capture one clear face. The server detects and compares it with the enrolled profile.</span>
            </div>
            <div className="field" style={{ marginBottom: 14 }}>
              <label htmlFor="scan-user">Username</label>
              <input id="scan-user" type="text" required value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: 14 }}>
              <label htmlFor="scan-lab">Laboratory</label>
              <select id="scan-lab" required value={laboratoryId} onChange={(e) => setLaboratoryId(e.target.value)}>
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

            <div className="check-grid">
              <div className="field checkbox-field">
                <input id="scan-face" type="checkbox" checked={faceVerified} onChange={(e) => setFaceVerified(e.target.checked)} />
                <label htmlFor="scan-face">Face verified</label>
              </div>
              <div className="field checkbox-field">
                <input
                  id="scan-fp"
                  type="checkbox"
                  checked={fingerprintVerified}
                  onChange={(e) => setFingerprintVerified(e.target.checked)}
                />
                <label htmlFor="scan-fp">Fingerprint verified</label>
              </div>
            </div>

            <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: "100%", justifyContent: "center" }}>
              {submitting ? "Scanning…" : "Run scan"}
            </button>
          </form>
        </Panel>

        <Panel title="Result" sub="Recorded to the Authentication Log regardless of outcome.">
          {!result && (
            <div className="empty-state">
              <div className="glyph">◈</div>
              <p>Run a scan to see the access decision.</p>
            </div>
          )}
          {result && (
            <div className={`scan-result ${result.result === "GRANTED" ? "granted" : "denied"}`}>
              <div className="result-code">{result.result}</div>
              <div className="result-msg">{result.message}</div>
              {(result.user || result.laboratory) && (
                <div className="result-msg mono" style={{ marginTop: 10 }}>
                  {result.user ? `user: ${result.user}` : ""} {result.laboratory ? `· lab: ${result.laboratory}` : ""}
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
