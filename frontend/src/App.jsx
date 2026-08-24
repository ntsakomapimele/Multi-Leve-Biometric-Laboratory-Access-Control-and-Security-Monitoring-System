import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Laboratories from "./pages/Laboratories";
import BiometricProfiles from "./pages/BiometricProfiles";
import AccessPermissions from "./pages/AccessPermissions";
import AuthenticationEvents from "./pages/AuthenticationEvents";
import SecurityEvents from "./pages/SecurityEvents";
import Authenticate from "./pages/Authenticate";
import NotFound from "./pages/NotFound";

function Protected({ children }) {
  return (
    <ProtectedRoute>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/" element={<Protected><Dashboard /></Protected>} />
        <Route path="/laboratories" element={<Protected><Laboratories /></Protected>} />
        <Route path="/biometric-profiles" element={<Protected><BiometricProfiles /></Protected>} />
        <Route path="/permissions" element={<Protected><AccessPermissions /></Protected>} />
        <Route path="/authentication-events" element={<Protected><AuthenticationEvents /></Protected>} />
        <Route path="/security-events" element={<Protected><SecurityEvents /></Protected>} />
        <Route path="/authenticate" element={<Protected><Authenticate /></Protected>} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
}
