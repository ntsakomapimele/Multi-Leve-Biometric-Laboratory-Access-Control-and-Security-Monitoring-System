import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="login-screen">
      <div className="login-card" style={{ textAlign: "center" }}>
        <p className="page-eyebrow">404</p>
        <h1 className="page-title" style={{ marginBottom: 10 }}>
          No such route
        </h1>
        <p className="page-sub" style={{ margin: "0 auto 20px" }}>
          That path isn't wired into the console.
        </p>
        <Link className="btn btn-primary" to="/">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
