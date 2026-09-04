import { useNotificacionStore } from "../lib/notificationService";

export function ToastContainer() {
  const { notificaciones, remover } = useNotificacionStore();

  const getColores = (tipo: string) => {
    switch (tipo) {
      case "success":
        return {
          bg: "#10b981",
          bgLight: "rgba(16, 185, 129, 0.1)",
          border: "#059669",
          icon: "✓",
        };
      case "error":
        return {
          bg: "#ef4444",
          bgLight: "rgba(239, 68, 68, 0.1)",
          border: "#dc2626",
          icon: "✕",
        };
      case "warning":
        return {
          bg: "#f59e0b",
          bgLight: "rgba(245, 158, 11, 0.1)",
          border: "#d97706",
          icon: "⚠",
        };
      default:
        return {
          bg: "#3b82f6",
          bgLight: "rgba(59, 130, 246, 0.1)",
          border: "#2563eb",
          icon: "ℹ",
        };
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 2000,
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        maxWidth: "360px",
      }}
    >
      {notificaciones.map((notif) => {
        const colores = getColores(notif.tipo);
        return (
          <div
            key={notif.id}
            style={{
              display: "flex",
              alignItems: "start",
              gap: "12px",
              padding: "14px 16px",
              background: colores.bgLight,
              border: `2px solid ${colores.border}`,
              borderRadius: "8px",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
              animation: "slideInRight 0.3s ease-out",
            }}
          >
            {/* Ícono */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                background: colores.bg,
                color: "#fff",
                fontSize: "16px",
                fontWeight: "bold",
                flexShrink: 0,
              }}
            >
              {colores.icon}
            </div>

            {/* Contenido */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "var(--text)",
                  wordBreak: "break-word",
                }}
              >
                {notif.mensaje}
              </p>
            </div>

            {/* Botón Cerrar */}
            <button
              onClick={() => remover(notif.id)}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                padding: "0",
                fontSize: "18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "24px",
                height: "24px",
                flexShrink: 0,
              }}
              title="Cerrar"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
