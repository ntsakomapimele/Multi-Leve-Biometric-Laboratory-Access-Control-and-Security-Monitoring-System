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
import AccessTerminal from "./pages/AccessTerminal";
import NotFound from "./pages/NotFound";

function Protected({ children, path }) {
  return (
    <ProtectedRoute path={path}>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/" element={<Protected path="/"><Dashboard /></Protected>} />
        <Route path="/laboratories" element={<Protected path="/laboratories"><Laboratories /></Protected>} />
        <Route path="/biometric-profiles" element={<Protected path="/biometric-profiles"><BiometricProfiles /></Protected>} />
        <Route path="/permissions" element={<Protected path="/permissions"><AccessPermissions /></Protected>} />
        <Route path="/authentication-events" element={<Protected path="/authentication-events"><AuthenticationEvents /></Protected>} />
        <Route path="/security-events" element={<Protected path="/security-events"><SecurityEvents /></Protected>} />
        <Route path="/authenticate" element={<Protected path="/authenticate"><Authenticate /></Protected>} />
        <Route path="/terminal" element={<AccessTerminal />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
}
