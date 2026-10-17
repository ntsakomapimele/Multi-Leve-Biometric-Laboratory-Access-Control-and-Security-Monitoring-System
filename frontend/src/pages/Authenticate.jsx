import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../api/client";
import { PageHead, Panel, ErrorAlert } from "../components/ui";

export default function Authenticate() {
  const [labs, setLabs] = useState([]);
  const [username, setUsername] = useState("");
  const [laboratoryId, setLaboratoryId] = useState("");
  const [faceVerified, setFaceVerified] = useState(false);
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

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setResult(null);
    try {
      const res = await api.post("/reader-test/", {
        username,
        laboratory_id: Number(laboratoryId),
        face_verified: faceVerified,
        fingerprint_verified: fingerprintVerified,
      });
      setResult(res.data);
    } catch (err) {
      // ReaderTestView returns a structured GRANTED/DENIED body even on
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
      <PageHead eyebrow="Administrator tools" title="Reader Test" sub="Test permission decisions with simulated biometrics. This does not perform facial recognition or operate a door." />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }} className="dash-grid">
        <Panel accent title="Test inputs" sub="Simulated checks are isolated from the live access terminal.">
          <form onSubmit={handleSubmit}>
            <ErrorAlert message={error} />
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
                <label htmlFor="scan-face">Simulate face match</label>
              </div>
              <div className="field checkbox-field">
                <input
                  id="scan-fp"
                  type="checkbox"
                  checked={fingerprintVerified}
                  onChange={(e) => setFingerprintVerified(e.target.checked)}
                />
                <label htmlFor="scan-fp">Simulate fingerprint match</label>
              </div>
            </div>

            <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: "100%", justifyContent: "center" }}>
              {submitting ? "Testing…" : "Run reader test"}
            </button>
          </form>
        </Panel>

        <Panel title="Test result" sub="Recorded as a reader-test event; no physical hardware is activated.">
          {!result && (
            <div className="empty-state">
              <div className="glyph">◈</div>
              <p>Run a scan to see the access decision.</p>
            </div>
          )}
          {result && (
            <div className={`scan-result ${result.result === "GRANTED" ? "granted" : "denied"}`}>
              <div className="result-code">{result.result}</div>
              <div className="result-msg">{result.denial_reason || result.message}</div>
              <div className="result-msg mono" style={{ marginTop: 10 }}>Door release: not connected</div>
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
