import { Navigate } from "react-router-dom";
import { useSesionStore } from "../lib/store";

interface ProtectedAdminRouteProps {
  children: React.ReactNode;
}

export function ProtectedAdminRoute({ children }: ProtectedAdminRouteProps) {
  const { usuario } = useSesionStore();

  // Super Admin email (hardcoded for now, can be environment variable)
  const SUPER_ADMIN_EMAIL = process.env.REACT_APP_SUPER_ADMIN_EMAIL || "hnieto@deepscan.com.co";

  // Check if user is authenticated and is Super Admin
  if (!usuario) {
    return <Navigate to="/login" replace />;
  }

  // Check if user email matches super admin email
  if (usuario.email !== SUPER_ADMIN_EMAIL) {
    console.warn(`⚠️ SECURITY: Unauthorized access attempt to /centrala-admin by ${usuario.email}`);

    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(-45deg, rgba(219, 234, 254, 0.8) 0%, rgba(220, 252, 231, 0.7) 25%, rgba(219, 234, 254, 0.75) 50%, rgba(220, 252, 231, 0.8) 75%, rgba(219, 234, 254, 0.8) 100%)",
        backgroundSize: "400% 400%",
        animation: "gradientShift 15s ease infinite"
      }}>
        <div style={{
          background: "rgba(255, 255, 255, 0.75)",
          backdropFilter: "blur(30px)",
          borderRadius: "32px",
          padding: "48px 40px",
          maxWidth: "480px",
          width: "100%",
          textAlign: "center",
          border: "1px solid rgba(255, 255, 255, 0.95)",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08), 0 10px 20px rgba(0, 0, 0, 0.12), 0 20px 40px rgba(59, 130, 246, 0.12), 0 40px 80px rgba(0, 0, 0, 0.14)"
        }}>
          <h1 style={{ color: "#0f172a", marginBottom: "16px" }}>🔒 Acceso Denegado</h1>
          <p style={{ color: "#475569", marginBottom: "24px" }}>
            Solo el Super Admin puede acceder a esta sección.
          </p>
          <p style={{ color: "#94a3b8", fontSize: "13px" }}>
            Tu email: <strong>{usuario.email}</strong>
          </p>
          <div style={{ marginTop: "32px" }}>
            <p style={{ color: "#cbd5e1", fontSize: "12px" }}>
              Se ha registrado este intento en los logs de seguridad.
            </p>
          </div>
        </div>

        <style>{`
          @keyframes gradientShift {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
        `}</style>
      </div>
    );
  }

  // ✅ User is Super Admin - grant access
  return <>{children}</>;
}
