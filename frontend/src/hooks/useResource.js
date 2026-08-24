import { useCallback, useEffect, useState } from "react";
import api, { extractErrorMessage } from "../api/client";

// Thin data-fetching hook shared by every resource page (laboratories,
// access permissions, biometric profiles, event logs). Handles the list
// fetch, loading/error state, and a distinct 403 branch so pages can show
// PermissionDenied with the message the backend actually sent instead of a
// generic error banner.
export function useResourceList(endpoint) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setForbidden("");
    try {
      const res = await api.get(endpoint);
      const data = res.data;
      setItems(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      if (err.response?.status === 403) {
        setForbidden(extractErrorMessage(err, "Access to this resource is restricted."));
      } else {
        setError(extractErrorMessage(err, "Couldn't load records."));
      }
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    load();
  }, [load]);

  const create = useCallback(
    async (payload) => {
      const res = await api.post(endpoint, payload);
      setItems((prev) => [res.data, ...prev]);
      return res.data;
    },
    [endpoint]
  );

  const update = useCallback(
    async (id, payload) => {
      const res = await api.patch(`${endpoint}${id}/`, payload);
      setItems((prev) => prev.map((it) => (it.id === id ? res.data : it)));
      return res.data;
    },
    [endpoint]
  );

  const remove = useCallback(
    async (id) => {
      await api.delete(`${endpoint}${id}/`);
      setItems((prev) => prev.filter((it) => it.id !== id));
    },
    [endpoint]
  );

  return { items, loading, error, forbidden, reload: load, create, update, remove, setItems };
}
