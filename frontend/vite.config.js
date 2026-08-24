import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The Django backend (see AuthenticateView, the viewsets in access_control/)
// does not have django-cors-headers installed, so in dev we proxy /api
// straight through to Django on localhost:8000 and talk to same-origin
// "/api" from the browser. No backend changes required.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
