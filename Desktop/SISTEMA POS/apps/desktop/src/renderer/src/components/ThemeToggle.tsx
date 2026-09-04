import { useEffect, useState } from "react";
import { useTemaStore } from "../lib/store";

export function ThemeToggle() {
  const { tema, setTema } = useTemaStore();
  const [mostrarMenu, setMostrarMenu] = useState(false);
  const [temaSistema, setTemaSistema] = useState<"light" | "dark">("light");

  // Detectar preferencia del sistema
  useEffect(() => {
    if (typeof window !== "undefined") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
      setTemaSistema(prefersDark.matches ? "dark" : "light");

      const handleChange = (e: MediaQueryListEvent) => {
        setTemaSistema(e.matches ? "dark" : "light");
      };

      prefersDark.addEventListener("change", handleChange);
      return () => prefersDark.removeEventListener("change", handleChange);
    }
  }, []);

  const temaActual = tema === "auto" ? temaSistema : tema;
  const iconoTema = temaActual === "dark" ? "🌙" : "☀️";
  const labelTema = tema === "auto" ? "Auto (Automático)" : tema === "dark" ? "Oscuro" : "Claro";

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setMostrarMenu(!mostrarMenu)}
        style={{
          background: "var(--surface-secondary)",
          border: "1px solid var(--border-light)",
          padding: "8px 12px",
          borderRadius: "8px",
          cursor: "pointer",
          fontSize: "12px",
          fontWeight: "600",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          transition: "all 0.2s ease",
          color: "var(--text)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--surface)";
          e.currentTarget.style.borderColor = "var(--brand)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--surface-secondary)";
          e.currentTarget.style.borderColor = "var(--border-light)";
        }}
        title="Cambiar tema"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {temaActual === "dark" ? (
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          ) : (
            <circle cx="12" cy="12" r="5" />
          )}
          {temaActual === "dark" ? null : (
            <>
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </>
          )}
        </svg>
        {labelTema}
      </button>

      {mostrarMenu && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: "8px",
            background: "var(--surface)",
            border: "1px solid var(--border-light)",
            borderRadius: "8px",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.15)",
            zIndex: 1000,
            overflow: "hidden",
            minWidth: "160px",
            animation: "slideInUp 0.2s ease-out",
          }}
        >
          {(["light", "dark", "auto"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTema(t);
                setMostrarMenu(false);
              }}
              style={{
                width: "100%",
                padding: "12px 16px",
                background: tema === t ? "var(--brand)" : "transparent",
                color: tema === t ? "#fff" : "var(--text)",
                border: "none",
                textAlign: "left",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: "600",
                transition: "all 0.15s ease",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
              onMouseEnter={(e) => {
                if (tema !== t) {
                  e.currentTarget.style.background = "var(--surface-secondary)";
                }
              }}
              onMouseLeave={(e) => {
                if (tema !== t) {
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              <span style={{ fontSize: "14px" }}>
                {t === "light" ? "☀️" : t === "dark" ? "🌙" : "⚙️"}
              </span>
              {t === "light" ? "Claro" : t === "dark" ? "Oscuro" : "Automático"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
