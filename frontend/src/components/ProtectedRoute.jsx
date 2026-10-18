import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { canAccess, ROLES } from "../auth/roles";

export default function ProtectedRoute({ children, path }) {
  const { user, isAuthenticated, ready } = useAuth();
  const location = useLocation();

  if (!ready) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (path && !canAccess(user?.role, path)) {
    return <Navigate to={user?.role === ROLES.LABORATORY_USER ? "/terminal" : "/login"} replace />;
  }

  return children;
}

