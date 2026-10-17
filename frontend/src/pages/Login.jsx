import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ErrorAlert } from "../components/ui";
import { ROLES } from "../auth/roles";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = location.state?.from?.pathname || "/";

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const res = await login(username, password);
    setSubmitting(false);
    if (res.ok) {
      navigate(res.role === ROLES.LABORATORY_USER ? "/terminal" : redirectTo, { replace: true });
    } else {
      setError(res.message);
    }
  }

  return (
    <div className="login-screen">
      <div className="scan-field" />
      <div className="scan-sweep" />

      <div className="login-card">
        <div className="login-head">
          <div className="brand-mark" />
          <h1>SentryLab Console</h1>
          <p>Biometric Access Control</p>
        </div>

        <ErrorAlert message={error} />

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Verifying…" : "Authenticate"}
          </button>
        </form>
        <div className="login-terminal-access">
          <span>Laboratory user?</span>
          <Link to="/terminal">Open access terminal</Link>
        </div>
      </div>
    </div>
  );
}
