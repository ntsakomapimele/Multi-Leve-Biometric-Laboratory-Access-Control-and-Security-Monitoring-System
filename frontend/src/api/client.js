import axios from "axios";

// All backend routes live under /api/ (see config/urls.py), including the
// SimpleJWT token endpoints, so a single base URL covers everything. In dev
// this is proxied to Django by vite.config.js; in prod, point
// VITE_API_BASE_URL at the deployed backend.
const baseURL = import.meta.env.VITE_API_BASE_URL || "/api";

const ACCESS_KEY = "sentrylab_access";
const REFRESH_KEY = "sentrylab_refresh";

export const tokenStore = {
  getAccess: () => localStorage.getItem(ACCESS_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  set: (access, refresh) => {
    localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear: () => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = tokenStore.getAccess();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// SimpleJWT access tokens expire quickly by default. On a 401 (and only
// once per request) try /api/token/refresh/ with the stored refresh token,
// then replay the original call.
let refreshPromise = null;

async function refreshAccessToken() {
  const refresh = tokenStore.getRefresh();
  if (!refresh) throw new Error("No refresh token available");

  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${baseURL}/token/refresh/`, { refresh })
      .then((res) => {
        tokenStore.set(res.data.access, refresh);
        return res.data.access;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;

    if (status === 401 && !original._retried && tokenStore.getRefresh()) {
      original._retried = true;
      try {
        const newAccess = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${newAccess}`;
        return api(original);
      } catch (refreshError) {
        tokenStore.clear();
        window.dispatchEvent(new CustomEvent("sentrylab:session-expired"));
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// Pulls a readable message out of DRF's various error shapes (field errors,
// detail strings, non_field_errors, permission "message" attrs) for display.
export function extractErrorMessage(error, fallback = "Something went wrong.") {
  const data = error?.response?.data;
  if (!data) return error?.message || fallback;
  if (typeof data === "string") return data;
  if (data.detail) return data.detail;
  if (data.message) return data.message;
  if (Array.isArray(data.non_field_errors)) return data.non_field_errors.join(" ");

  const fieldErrors = Object.entries(data)
    .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(" ") : msgs}`)
    .join(" · ");
  return fieldErrors || fallback;
}

export default api;
