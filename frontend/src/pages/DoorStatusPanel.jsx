import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "../api/client";

export default function DoorStatusPanel() {
  const [door, setDoor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function refreshDoorStatus() {
      try {
        const response = await api.get("/door/status/");
        if (!active) return;
        setDoor(response.data);
        setError("");
      } catch (err) {
        if (!active) return;
        setError(extractErrorMessage(err, "Unable to retrieve door status."));
        setDoor(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    refreshDoorStatus();
    const timer = window.setInterval(refreshDoorStatus, 2000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const status = door?.door_status;
  const isOpen = status === "OPEN";
  const isClosed = status === "CLOSED";
  const online = door?.device_online !== false;

  return (
    <section className="panel door-status-panel">
      <div className="door-status-heading">
        <div>
          <span className="terminal-kicker">PHYSICAL SECURITY</span>
          <h2>Laboratory door</h2>
        </div>
        <span
          className={`door-status-badge ${
            error || !online
              ? "door-status-unavailable"
              : isOpen
                ? "door-status-open"
                : isClosed
                  ? "door-status-closed"
                  : "door-status-unknown"
          }`}
        >
          {loading && !door
            ? "CHECKING"
            : error || !online
              ? "UNAVAILABLE"
              : isOpen
                ? "OPEN"
                : isClosed
                  ? "CLOSED"
                  : "UNKNOWN"}
        </span>
      </div>

      <p className="door-status-description">
        {error
          ? "The current physical door state could not be verified."
          : !online
            ? "The door controller is not responding."
            : isOpen
              ? "The reed switch indicates that the door is open."
              : isClosed
                ? "The reed switch indicates that the door is closed."
                : "Waiting for a valid door sensor reading."}
      </p>

      {error && (
        <p role="alert" className="door-status-error">
          {error}
        </p>
      )}

      <div className="door-status-details">
        <span>Sensor reading</span>
        <strong>
          {door?.sensor_reading === 0 || door?.sensor_reading === 1
            ? door.sensor_reading
            : "—"}
        </strong>
        <span>Last device update</span>
        <strong>
          {door?.last_updated
            ? new Date(door.last_updated).toLocaleTimeString()
            : "—"}
        </strong>
      </div>
    </section>
  );
}
