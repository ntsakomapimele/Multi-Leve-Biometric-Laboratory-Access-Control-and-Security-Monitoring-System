import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import api, { tokenStore, extractErrorMessage } from "../api/client";
import { getRole } from "../auth/roles";

const AuthContext = createContext(null);

function decodeJwtPayload(token) {
  try {
    const [, payload] = token.split(".");
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return json;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = tokenStore.getAccess();
    if (token) {
      const payload = decodeJwtPayload(token);
      setUser(payload ? { id: payload.user_id, username: payload.username, roles: payload.roles || [], role: getRole(payload.roles) } : { username: "operator" });
    }
    setReady(true);

    const handleExpired = () => setUser(null);
    window.addEventListener("sentrylab:session-expired", handleExpired);
    return () => window.removeEventListener("sentrylab:session-expired", handleExpired);
  }, []);

  const login = useCallback(async (username, password) => {
    try {
      const res = await api.post("/token/", { username, password });
      tokenStore.set(res.data.access, res.data.refresh);
      const payload = decodeJwtPayload(res.data.access);
      const roles = payload?.roles || [];
      const role = getRole(roles);
      setUser({ id: payload?.user_id, username: payload?.username || username, roles, role });
      return { ok: true, role };
    } catch (err) {
      return { ok: false, message: extractErrorMessage(err, "Invalid credentials.") };
    }
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, ready, isAuthenticated: !!user, login, logout }),
    [user, ready, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
