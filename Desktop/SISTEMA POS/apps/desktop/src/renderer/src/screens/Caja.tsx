import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  Lock,
  Unlock,
  CreditCard,
  Smartphone,
  Send,
  TrendingUp,
  XCircle,
  AlertCircle,
  CheckCircle,
  Plus,
  Minus,
  Printer,
  History,
  Download,
  ArrowRightLeft,
} from "lucide-react";

const styles = `
  .caja-container { min-height: 100vh; background: #FFFFFF; padding: 32px; }
  .caja-header { display: flex; align-items: center; gap: 16px; margin-bottom: 32px; }
  .caja-title { font-size: 28px; font-weight: 700; color: #0f172a; }
  .caja-closed { background: #f5f5f5; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 80vh; gap: 32px; }
  .caja-lock-icon { color: #94a3b8; }

  .caja-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 32px; }
  .caja-card { background: #FFFFFF; border: 1px solid rgba(59, 130, 246, 0.08); border-radius: 12px; padding: 16px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04); }
  .caja-card-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; font-weight: 600; margin-bottom: 8px; }
  .caja-card-value { font-size: 22px; font-weight: 800; color: #3B82F6; }
  .caja-card-icon { margin-bottom: 8px; color: #64748b; }

  .form-input { width: 100%; height: 42px; padding: 0.5rem 1rem; border: 1px solid #E2E8F0; border-radius: 8px; font-size: 14px; outline: none; }
  .form-input:focus { border-color: #3B82F6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
  .form-select { width: 100%; height: 42px; padding: 0.5rem 1rem; border: 1px solid #E2E8F0; border-radius: 8px; font-size: 14px; }

  .caja-buttons { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-bottom: 32px; }
  .caja-btn { padding: 12px 24px; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; height: 44px; }
  .caja-btn-primary { background: #3B82F6; color: white; }
  .caja-btn-primary:hover { background: #2563EB; transform: translateY(-2px); }
  .caja-btn-secondary { background: #e2e8f0; color: #1e293b; }
  .caja-btn-secondary:hover { background: #cbd5e1; }
  .caja-btn-danger { background: #dc2626; color: white; }
  .caja-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .caja-modal { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.5); display: flex; align-items: center; justify-content: center; z-index: 999; }
  .caja-modal-content { background: white; border-radius: 16px; padding: 32px; width: 90%; max-width: 600px; max-height: 90vh; overflow-y: auto; }
  .caja-modal-close { position: absolute; top: 16px; right: 16px; background: none; border: none; cursor: pointer; }

  .caja-movimientos { background: #f8fafc; border-radius: 12px; padding: 16px; margin-bottom: 24px; }
  .caja-movimientos-title { font-size: 14px; font-weight: 700; color: #1e293b; margin-bottom: 12px; }
  .caja-movimiento-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
  .caja-movimiento-ingreso { color: #16a34a; font-weight: 600; }
  .caja-movimiento-egreso { color: #dc2626; font-weight: 600; }

  .caja-estado-badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .caja-estado-cuadrado { background: #d1fae5; color: #065f46; }
  .caja-estado-sobrante { background: #fef08a; color: #78350f; }
  .caja-estado-faltante { background: #fee2e2; color: #7f1d1d; }

  @media print {
    body { background: white; }
    .no-print { display: none !important; }
    .ticket-z { width: 80mm; margin: 0 auto; font-family: monospace; color: black; background: white; padding: 0; }
    .ticket-z * { box-shadow: none; border: none; margin: 0; padding: 4px 0; }
  }

  .ticket-z { font-family: monospace; font-size: 12px; line-height: 1.4; color: #000; background: #fff; }
  .ticket-header { text-align: center; font-weight: bold; margin-bottom: 8px; border-bottom: 1px dashed #000; padding-bottom: 8px; }
  .ticket-row { display: flex; justify-content: space-between; padding: 2px 0; }
  .ticket-divider { border-top: 1px dashed #000; margin: 8px 0; }
  .ticket-total { font-weight: bold; font-size: 14px; text-align: center; padding: 8px 0; }
`;

interface Movimiento {
  id: string;
  tipo: "INGRESO" | "EGRESO";
  monto: number;
  concepto: string;
  fecha: string;
}

export default function Caja() {
  const [estado, setEstado] = useState("CERRADA");
  const [turno, setTurno] = useState<any>(null);
  const [canales, setCanales] = useState<any>(null);
  const [totales, setTotales] = useState<any>(null);
  const [saldoInicial, setSaldoInicial] = useState("");
  const [loading, setLoading] = useState(false);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [mostrarMovimiento, setMostrarMovimiento] = useState(false);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [movimientoForm, setMovimientoForm] = useState({
    tipo: "INGRESO" as "INGRESO" | "EGRESO",
    monto: "",
    concepto: "",
  });
  const [cierre, setCierre] = useState({
    reportadoEfectivo: "",
    reportadoTarjeta: "",
    reportadoTransferencia: "",
    reportadoCredito: "",
    reportadoOtro: "",
    observaciones: "",
  });

  useEffect(() => {
    cargarEstado();
    const interval = setInterval(cargarEstado, 30000);
    return () => clearInterval(interval);
  }, []);

  async function cargarEstado() {
    try {
      const { data } = await api.get("/caja/estado");
      setEstado(data.estado);
      if (data.estado === "ABIERTA") {
        setTurno(data.turno);
        setCanales(data.canales);
        setTotales(data.totales);
      }
    } catch (error) {
      console.error("Error:", error);
    }
  }

  async function abrirCaja() {
    if (!saldoInicial) return alert("Ingresa saldo inicial");
    try {
      setLoading(true);
      await api.post("/caja/abrir", { saldoInicial: parseFloat(saldoInicial) });
      setSaldoInicial("");
      await cargarEstado();
    } catch (error) {
      alert("Error al abrir caja");
    } finally {
      setLoading(false);
    }
  }

  async function registrarMovimiento() {
    if (!movimientoForm.monto || !movimientoForm.concepto) return alert("Completa todos los campos");
    try {
      setLoading(true);
      await api.post("/caja/movimiento", {
        tipo: movimientoForm.tipo,
        monto: parseFloat(movimientoForm.monto),
        concepto: movimientoForm.concepto,
      });
      setMovimientoForm({ tipo: "INGRESO", monto: "", concepto: "" });
      setMostrarMovimiento(false);
      await cargarEstado();
    } catch (error) {
      alert("Error al registrar movimiento");
    } finally {
      setLoading(false);
    }
  }

  function generarPDFCierre() {
    const doc = new jsPDF("p", "mm", "a4");
    const fecha = new Date().toLocaleDateString("es-CO");
    const hora = new Date().toLocaleTimeString("es-CO");

    // Encabezado
    doc.setFontSize(18);
    doc.text("CIERRE DE CAJA", 105, 15, { align: "center" });
    doc.setFontSize(14);
    doc.text("TICKET Z", 105, 23, { align: "center" });

    doc.setFontSize(10);
    doc.text(`Fecha: ${fecha}`, 15, 35);
    doc.text(`Hora: ${hora}`, 15, 42);
    doc.text(`Cajero: ${turno?.usuario || "N/A"}`, 15, 49);

    // Tabla de desglose
    doc.setFontSize(12);
    doc.text("DESGLOSE POR MÉTODO DE PAGO", 15, 60);

    const tableData = [
      [
        "Método",
        "Esperado",
        "Reportado",
        "Diferencia",
      ],
      [
        "EFECTIVO",
        `$${(canales?.efectivo?.esperado || 0).toLocaleString()}`,
        `$${cierre.reportadoEfectivo || 0}`,
        `$${(parseFloat(cierre.reportadoEfectivo || "0") - (canales?.efectivo?.esperado || 0)).toLocaleString()}`,
      ],
      [
        "TARJETA",
        `$${(canales?.tarjeta?.esperado || 0).toLocaleString()}`,
        `$${cierre.reportadoTarjeta || 0}`,
        `$${(parseFloat(cierre.reportadoTarjeta || "0") - (canales?.tarjeta?.esperado || 0)).toLocaleString()}`,
      ],
      [
        "TRANSFERENCIA",
        `$${(canales?.transferencia?.esperado || 0).toLocaleString()}`,
        `$${cierre.reportadoTransferencia || 0}`,
        `$${(parseFloat(cierre.reportadoTransferencia || "0") - (canales?.transferencia?.esperado || 0)).toLocaleString()}`,
      ],
      [
        "CRÉDITO",
        `$${(canales?.credito?.esperado || 0).toLocaleString()}`,
        `$${cierre.reportadoCredito || 0}`,
        `$${(parseFloat(cierre.reportadoCredito || "0") - (canales?.credito?.esperado || 0)).toLocaleString()}`,
      ],
      [
        "OTRO",
        `$${(canales?.otro?.esperado || 0).toLocaleString()}`,
        `$${cierre.reportadoOtro || 0}`,
        `$${(parseFloat(cierre.reportadoOtro || "0") - (canales?.otro?.esperado || 0)).toLocaleString()}`,
      ],
    ];

    autoTable(doc, {
      head: [tableData[0]],
      body: tableData.slice(1),
      startY: 68,
      margin: { left: 15, right: 15 },
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });

    // Resumen final
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(11);
    doc.text("RESUMEN FINAL", 15, finalY);
    doc.setFontSize(10);
    doc.text(`Total Ventas: $${(totales?.ventasTotales || 0).toLocaleString()}`, 15, finalY + 7);
    doc.text(`Total Ingresos: $${(totales?.ingresos || 0).toLocaleString()}`, 15, finalY + 14);
    doc.text(`Total Egresos: $${(totales?.egresos || 0).toLocaleString()}`, 15, finalY + 21);

    // Pie de página
    doc.setFontSize(8);
    doc.text("--- FIN DE TICKET ---", 105, finalY + 35, { align: "center" });
    doc.text("Gracias por su visita", 105, finalY + 42, { align: "center" });

    // Descargar automáticamente
    const nombreArchivo = `Cierre_Caja_${fecha.replace(/\//g, "-")}.pdf`;
    doc.save(nombreArchivo);
  }

  async function cerrarCaja() {
    try {
      setLoading(true);
      const payload = {
        reportadoEfectivo: parseFloat(cierre.reportadoEfectivo),
        reportadoTarjeta: cierre.reportadoTarjeta ? parseFloat(cierre.reportadoTarjeta) : 0,
        reportadoTransferencia: cierre.reportadoTransferencia ? parseFloat(cierre.reportadoTransferencia) : 0,
        reportadoCredito: cierre.reportadoCredito ? parseFloat(cierre.reportadoCredito) : 0,
        reportadoOtro: cierre.reportadoOtro ? parseFloat(cierre.reportadoOtro) : 0,
        observaciones: cierre.observaciones || undefined,
      };
      await api.post("/caja/cerrar", payload);
      alert("Caja cerrada. Descargando PDF...");
      generarPDFCierre();
      setMostrarModal(false);
      setCierre({
        reportadoEfectivo: "",
        reportadoTarjeta: "",
        reportadoTransferencia: "",
        reportadoCredito: "",
        reportadoOtro: "",
        observaciones: "",
      });
      await cargarEstado();
    } catch (error) {
      alert("Error al cerrar caja");
    } finally {
      setLoading(false);
    }
  }

  function imprimirTicketZ() {
    const ventanaImpresion = window.open("", "_blank");
    if (!ventanaImpresion) return alert("Habilita las ventanas emergentes");

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Ticket Z - Cierre de Caja</title>
        <style>
          body { margin: 0; padding: 10px; font-family: monospace; font-size: 12px; }
          .ticket-z { width: 80mm; }
          .ticket-header { text-align: center; font-weight: bold; margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
          .ticket-row { display: flex; justify-content: space-between; padding: 3px 0; }
          .ticket-divider { border-top: 1px dashed #000; margin: 10px 0; }
          .ticket-total { font-weight: bold; font-size: 14px; text-align: center; padding: 10px 0; }
          .ticket-footer { text-align: center; font-size: 10px; margin-top: 10px; border-top: 1px dashed #000; padding-top: 10px; }
          @media print { body { margin: 0; padding: 0; } }
        </style>
      </head>
      <body>
        <div class="ticket-z">
          <div class="ticket-header">
            <div>CIERRE DE CAJA</div>
            <div>TICKET Z</div>
          </div>

          <div class="ticket-row">
            <span>Cajero:</span>
            <span>${turno?.usuario || "N/A"}</span>
          </div>
          <div class="ticket-row">
            <span>Fecha Apertura:</span>
            <span>${turno ? new Date(turno.abiertaDesde).toLocaleString() : "N/A"}</span>
          </div>
          <div class="ticket-row">
            <span>Fecha Cierre:</span>
            <span>${new Date().toLocaleString()}</span>
          </div>

          <div class="ticket-divider"></div>

          <div style="text-align: center; font-weight: bold; margin-bottom: 5px;">DESGLOSE POR MÉTODO</div>

          <div class="ticket-row">
            <span>EFECTIVO:</span>
            <span></span>
          </div>
          <div class="ticket-row" style="padding-left: 10px;">
            <span>Esperado:</span>
            <span>$${(canales?.efectivo?.esperado || 0).toLocaleString()}</span>
          </div>
          <div class="ticket-row" style="padding-left: 10px;">
            <span>Reportado:</span>
            <span>$${cierre.reportadoEfectivo}</span>
          </div>

          <div class="ticket-row">
            <span>TARJETA:</span>
            <span></span>
          </div>
          <div class="ticket-row" style="padding-left: 10px;">
            <span>Esperado:</span>
            <span>$${(canales?.tarjeta?.esperado || 0).toLocaleString()}</span>
          </div>
          <div class="ticket-row" style="padding-left: 10px;">
            <span>Reportado:</span>
            <span>$${cierre.reportadoTarjeta || 0}</span>
          </div>

          <div class="ticket-row">
            <span>TRANSFERENCIA:</span>
            <span></span>
          </div>
          <div class="ticket-row" style="padding-left: 10px;">
            <span>Esperado:</span>
            <span>$${(canales?.transferencia?.esperado || 0).toLocaleString()}</span>
          </div>
          <div class="ticket-row" style="padding-left: 10px;">
            <span>Reportado:</span>
            <span>$${cierre.reportadoTransferencia || 0}</span>
          </div>

          <div class="ticket-divider"></div>

          <div class="ticket-row">
            <span>Total Ventas:</span>
            <span>$${(totales?.ventasTotales || 0).toLocaleString()}</span>
          </div>
          <div class="ticket-row">
            <span>Total Ingresos:</span>
            <span>$${(totales?.ingresos || 0).toLocaleString()}</span>
          </div>
          <div class="ticket-row">
            <span>Total Egresos:</span>
            <span>$${(totales?.egresos || 0).toLocaleString()}</span>
          </div>

          <div class="ticket-footer">
            <div>------- FIN DE TICKET -------</div>
            <div style="margin-top: 5px;">Gracias por su visita</div>
          </div>
        </div>
      </body>
      </html>
    `;

    ventanaImpresion.document.write(html);
    ventanaImpresion.document.close();
    setTimeout(() => {
      ventanaImpresion.print();
      ventanaImpresion.close();
    }, 250);
  }

  const renderCanalCard = (titulo: string, icono: any, valor: number) => (
    <div className="caja-card">
      {icono}
      <div className="caja-card-label">{titulo}</div>
      <div className="caja-card-value">${valor.toLocaleString("es-CO", { maximumFractionDigits: 0 })}</div>
    </div>
  );

  return (
    <div className="caja-container">
      <style>{styles}</style>

      {estado === "CERRADA" ? (
        <div className="caja-closed">
          <Lock size={48} className="caja-lock-icon" />
          <div>
            <h2>Caja Cerrada</h2>
            <p>Abre la caja para comenzar el turno</p>
          </div>
          <div style={{ width: "100%", maxWidth: "300px" }}>
            <input
              type="number"
              className="form-input"
              placeholder="Saldo inicial"
              value={saldoInicial}
              onChange={(e) => setSaldoInicial(e.target.value)}
              step="0.01"
            />
            <button onClick={abrirCaja} disabled={loading} className="caja-btn caja-btn-primary" style={{ width: "100%", marginTop: "12px" }}>
              <Unlock size={16} /> Abrir Caja
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="caja-header">
            <h1 className="caja-title">Caja Abierta</h1>
            {turno && <span style={{ color: "#64748b", fontSize: "14px" }}>Operador: {turno.usuario}</span>}
          </div>

          {/* Grid de Resumen de Canales */}
          <div className="caja-grid">
            {renderCanalCard("EFECTIVO", <div className="caja-card-icon">💵</div>, canales?.efectivo?.esperado || 0)}
            {renderCanalCard("TARJETA", <CreditCard size={20} className="caja-card-icon" />, canales?.tarjeta?.esperado || 0)}
            {renderCanalCard("TRANSFERENCIA", <Send size={20} className="caja-card-icon" />, canales?.transferencia?.esperado || 0)}
            {renderCanalCard("CRÉDITO", <TrendingUp size={20} className="caja-card-icon" />, canales?.credito?.esperado || 0)}
            {renderCanalCard("OTRO", <Smartphone size={20} className="caja-card-icon" />, canales?.otro?.esperado || 0)}
            {renderCanalCard("TOTAL", <CheckCircle size={20} className="caja-card-icon" />, totales?.ventasTotales || 0)}
          </div>

          {/* Historial de Movimientos */}
          {movimientos.length > 0 && (
            <div className="caja-movimientos">
              <div className="caja-movimientos-title">📝 Movimientos de Hoy</div>
              {movimientos.map((m) => (
                <div key={m.id} className="caja-movimiento-item">
                  <span>{m.concepto}</span>
                  <span className={m.tipo === "INGRESO" ? "caja-movimiento-ingreso" : "caja-movimiento-egreso"}>
                    {m.tipo === "INGRESO" ? "+" : "-"}${m.monto.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Botones de acción */}
          <div className="caja-buttons">
            <button className="caja-btn caja-btn-secondary" onClick={() => setMostrarMovimiento(true)}>
              <ArrowRightLeft size={16} /> Movimiento
            </button>
            <button className="caja-btn caja-btn-primary" onClick={() => setMostrarModal(true)}>
              <Lock size={16} /> Cerrar Caja
            </button>
          </div>

          {/* Modal de Movimiento */}
          {mostrarMovimiento && (
            <div className="caja-modal" onClick={() => !loading && setMostrarMovimiento(false)}>
              <div className="caja-modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="caja-modal-close" onClick={() => !loading && setMostrarMovimiento(false)}>
                  <XCircle size={24} />
                </button>
                <h2 style={{ marginBottom: "24px", fontSize: "20px", fontWeight: 700 }}>Registrar Movimiento</h2>

                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
                  <label style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b", fontWeight: 600 }}>
                    Tipo
                  </label>
                  <select
                    value={movimientoForm.tipo}
                    onChange={(e) => setMovimientoForm({ ...movimientoForm, tipo: e.target.value as "INGRESO" | "EGRESO" })}
                    disabled={loading}
                    style={{ width: "100%", height: 42, padding: "8px 12px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 14 }}
                  >
                    <option value="INGRESO">➕ Ingreso (Sencillo)</option>
                    <option value="EGRESO">➖ Egreso (Pago)</option>
                  </select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
                  <label style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b", fontWeight: 600 }}>
                    Monto
                  </label>
                  <input
                    type="number"
                    placeholder="Ej. 50000"
                    value={movimientoForm.monto}
                    onChange={(e) => setMovimientoForm({ ...movimientoForm, monto: e.target.value })}
                    step="0.01"
                    disabled={loading}
                    style={{ width: "100%", height: 42, padding: "8px 12px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 14 }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 24 }}>
                  <label style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b", fontWeight: 600 }}>
                    Concepto
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Pago de agua, Sencillo, etc."
                    value={movimientoForm.concepto}
                    onChange={(e) => setMovimientoForm({ ...movimientoForm, concepto: e.target.value })}
                    disabled={loading}
                    style={{ width: "100%", height: 42, padding: "8px 12px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 14 }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <button
                    className="caja-btn caja-btn-primary"
                    onClick={registrarMovimiento}
                    disabled={loading}
                    style={{ width: "100%" }}
                  >
                    {loading ? "Registrando..." : "Registrar"}
                  </button>
                  <button
                    className="caja-btn"
                    onClick={() => setMostrarMovimiento(false)}
                    disabled={loading}
                    style={{ width: "100%", background: "#e2e8f0", color: "#1e293b" }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal de Cierre Multicanal */}
          {mostrarModal && (
            <div className="caja-modal" onClick={() => !loading && setMostrarModal(false)}>
              <div className="caja-modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="caja-modal-close" onClick={() => !loading && setMostrarModal(false)}>
                  <XCircle size={24} />
                </button>

                <h2 style={{ marginBottom: "24px", fontSize: "20px", fontWeight: 700 }}>Arqueo Multicanal</h2>

                {/* EFECTIVO */}
                <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", marginBottom: "16px", display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b", fontWeight: 600 }}>
                    💵 EFECTIVO (Cierre Ciego)
                  </label>
                  <input
                    type="number"
                    placeholder="Monto contado"
                    value={cierre.reportadoEfectivo}
                    onChange={(e) => setCierre({ ...cierre, reportadoEfectivo: e.target.value })}
                    step="0.01"
                    disabled={loading}
                    style={{ width: "100%", height: 42, padding: "8px 12px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 14 }}
                  />
                </div>

                {/* TARJETA */}
                <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", marginBottom: "16px", display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                    <CreditCard size={14} />
                    TARJETA
                  </label>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>
                    Esperado: ${(canales?.tarjeta?.esperado || 0).toLocaleString()}
                  </div>
                  <input
                    type="number"
                    placeholder="Monto en datáfono"
                    value={cierre.reportadoTarjeta}
                    onChange={(e) => setCierre({ ...cierre, reportadoTarjeta: e.target.value })}
                    step="0.01"
                    disabled={loading}
                    style={{ width: "100%", height: 42, padding: "8px 12px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 14 }}
                  />
                </div>

                {/* TRANSFERENCIA */}
                <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", marginBottom: "16px", display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                    <Send size={14} />
                    TRANSFERENCIA
                  </label>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>
                    Esperado: ${(canales?.transferencia?.esperado || 0).toLocaleString()}
                  </div>
                  <input
                    type="number"
                    placeholder="Monto verificado"
                    value={cierre.reportadoTransferencia}
                    onChange={(e) => setCierre({ ...cierre, reportadoTransferencia: e.target.value })}
                    step="0.01"
                    disabled={loading}
                    style={{ width: "100%", height: 42, padding: "8px 12px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 14 }}
                  />
                </div>

                {/* CRÉDITO */}
                <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", marginBottom: "16px", display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                    <TrendingUp size={14} />
                    CRÉDITO (Fiado)
                  </label>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>
                    Esperado: ${(canales?.credito?.esperado || 0).toLocaleString()}
                  </div>
                  <input
                    type="number"
                    placeholder="Monto reportado"
                    value={cierre.reportadoCredito}
                    onChange={(e) => setCierre({ ...cierre, reportadoCredito: e.target.value })}
                    step="0.01"
                    disabled={loading}
                    style={{ width: "100%", height: 42, padding: "8px 12px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 14 }}
                  />
                </div>

                {/* OTRO */}
                <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", marginBottom: "16px", display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                    <Smartphone size={14} />
                    OTRO
                  </label>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>
                    Esperado: ${(canales?.otro?.esperado || 0).toLocaleString()}
                  </div>
                  <input
                    type="number"
                    placeholder="Monto reportado"
                    value={cierre.reportadoOtro}
                    onChange={(e) => setCierre({ ...cierre, reportadoOtro: e.target.value })}
                    step="0.01"
                    disabled={loading}
                    style={{ width: "100%", height: 42, padding: "8px 12px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 14 }}
                  />
                </div>

                {/* OBSERVACIONES */}
                <div style={{ marginBottom: "24px", display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 12, textTransform: "uppercase", color: "#64748b", fontWeight: 600 }}>
                    Observaciones
                  </label>
                  <textarea
                    placeholder="Notas sobre el cierre"
                    value={cierre.observaciones}
                    onChange={(e) => setCierre({ ...cierre, observaciones: e.target.value })}
                    disabled={loading}
                    style={{ width: "100%", height: 80, padding: "8px 12px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 14, resize: "none", fontFamily: "inherit" }}
                  />
                </div>

                {/* Botones */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <button
                    className="caja-btn caja-btn-primary"
                    onClick={cerrarCaja}
                    disabled={loading || !cierre.reportadoEfectivo}
                    style={{ width: "100%" }}
                  >
                    {loading ? "Cerrando..." : "Cerrar Caja"}
                  </button>
                  <button
                    className="caja-btn"
                    onClick={() => setMostrarModal(false)}
                    disabled={loading}
                    style={{ width: "100%", background: "#e2e8f0", color: "#1e293b" }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
