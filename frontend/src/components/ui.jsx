// Small shared UI primitives used across the resource pages, kept in one
// file since each is only a few lines.

export function PageHead({ eyebrow, title, sub, action }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Panel({ title, sub, accent, children, className = "" }) {
  return (
    <div className={`panel ${accent ? "panel-accent" : ""} ${className}`}>
      <div className="panel-brackets-bottom" />
      {title && <h2 className="panel-title">{title}</h2>}
      {sub && <p className="panel-title-sub">{sub}</p>}
      {children}
    </div>
  );
}

export function ResultBadge({ result }) {
  const granted = result === "GRANTED";
  return <span className={`badge ${granted ? "badge-granted" : "badge-denied"}`}>{result}</span>;
}

export function SeverityBadge({ severity }) {
  const cls = severity === "HIGH" ? "badge-denied" : severity === "MEDIUM" ? "badge-warn" : "badge-neutral";
  return <span className={`badge ${cls}`}>{severity}</span>;
}

export function BoolBadge({ value, trueLabel = "YES", falseLabel = "NO" }) {
  return (
    <span className={`badge ${value ? "badge-granted" : "badge-neutral"}`}>
      {value ? trueLabel : falseLabel}
    </span>
  );
}

export function ErrorAlert({ message }) {
  if (!message) return null;
  return <div className="alert alert-error">{message}</div>;
}

export function LoadingRow({ label = "Loading records…" }) {
  return <div className="loading-row">{label}</div>;
}

export function EmptyState({ glyph = "∅", title, hint }) {
  return (
    <div className="empty-state">
      <div className="glyph">{glyph}</div>
      <p>{title}</p>
      {hint && <p className="faint">{hint}</p>}
    </div>
  );
}

// Shown when a request 403s — DRF's permission classes (IsAdministrator,
// CanViewSecurityEvents, etc.) supply `message`, which we surface directly
// rather than guessing at the required role client-side.
export function PermissionDenied({ message }) {
  return (
    <Panel accent>
      <EmptyState
        glyph="⛔"
        title={message || "Administrator access required."}
        hint="Your account isn't a member of the group this action needs. Ask an administrator to update your group membership in the Django admin."
      />
    </Panel>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
