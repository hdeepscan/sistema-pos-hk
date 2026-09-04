import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Red de seguridad: si cualquier pantalla falla al dibujarse, en vez de dejar
// la ventana en blanco (sin forma de recuperarse salvo cerrar la app),
// mostramos un aviso con la opcion de volver. Sin esto, un solo error de
// render deja al cajero sin sistema en plena venta.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{ padding: 32, maxWidth: 560, margin: "40px auto" }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Algo salio mal en esta pantalla</h3>
          <p style={{ fontSize: 13.5, color: "var(--text-muted)" }}>
            El sistema sigue funcionando. Puedes volver e intentar de nuevo; si el problema se repite, avisale a soporte.
          </p>
          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: "pointer", fontSize: 12.5, color: "var(--text-muted)" }}>Detalle tecnico</summary>
            <pre style={{ fontSize: 11, overflowX: "auto", background: "#f3f4f6", padding: 10, borderRadius: 8 }}>
              {this.state.error.message}
            </pre>
          </details>
          <button type="button" style={{ marginTop: 14 }} onClick={() => this.setState({ error: null })}>
            Volver
          </button>
        </div>
      </div>
    );
  }
}
