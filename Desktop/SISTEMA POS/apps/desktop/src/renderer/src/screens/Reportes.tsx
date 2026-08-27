import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
import { LineChart, BarraHorizontal, DonutChart, VariacionBadge, formatoMoneda } from "../lib/charts";
import { BotonesExportar } from "../lib/BotonesExportar";
import type { ColumnaExport } from "../lib/export";

interface Resumen {
  totalVentas: number;
  totalGastos: number;
  costoVentas: number;
  utilidadBruta: number;
  numeroVentas: number;
  unidadesVendidas: number;
  ticketPromedio: number;
  gastoPauta: number;
  roas: number | null;
  productosMasVendidos: { productoId: string; nombre: string; cantidad: number; total: number }[];
  ventasPorDia: { fecha: string; total: number }[];
  ventasPorMetodoPago: { metodoPago: string; total: number }[];
  ventasPorSucursal: { sucursalId: string; sucursalNombre: string; total: number }[];
  comparacion: { totalVentasAnterior: number; variacionVentas: number | null; variacionNumeroVentas: number | null };
}

function haceDias(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

const RANGOS = [
  { label: "7 dias", dias: 7 },
  { label: "30 dias", dias: 30 },
  { label: "90 dias", dias: 90 },
];

export default function Reportes() {
  const { sucursales } = useSesionStore();
  const [desde, setDesde] = useState(haceDias(30));
  const [hasta, setHasta] = useState(haceDias(0));
  const [sucursalId, setSucursalId] = useState("");
  const [canal, setCanal] = useState("");
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data } = await api.get<Resumen>("/reportes/resumen", {
      params: { desde, hasta, sucursalId: sucursalId || undefined, canal: canal || undefined },
    });
    setResumen(data);
    setCargando(false);
  }, [desde, hasta, sucursalId, canal]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function aplicarRango(dias: number) {
    setDesde(haceDias(dias));
    setHasta(haceDias(0));
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Reportes</h2>
          <p>Rendimiento del negocio, con comparacion contra el periodo anterior</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          {RANGOS.map((r) => (
            <button key={r.dias} className="secondary" type="button" onClick={() => aplicarRango(r.dias)}>
              {r.label}
            </button>
          ))}
          <label>
            Desde
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label>
            Hasta
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
          <label>
            Sucursal
            <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
              <option value="">Todas</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Canal de venta
            <select value={canal} onChange={(e) => setCanal(e.target.value)}>
              <option value="">Todos</option>
              <option value="POS">Punto de venta</option>
              <option value="SHOPIFY">Shopify</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="OTRO">Otro</option>
            </select>
          </label>
        </div>
      </div>

      {cargando || !resumen ? (
        <p className="empty-state">Cargando...</p>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="label">Ventas</div>
              <div className="value positive">{formatoMoneda(resumen.totalVentas)}</div>
              <VariacionBadge valor={resumen.comparacion.variacionVentas} />
            </div>
            <div className="stat-card">
              <div className="label">Utilidad bruta</div>
              <div className={`value ${resumen.utilidadBruta >= 0 ? "positive" : "negative"}`}>
                {formatoMoneda(resumen.utilidadBruta)}
              </div>
            </div>
            <div className="stat-card">
              <div className="label">Ticket promedio</div>
              <div className="value">{formatoMoneda(resumen.ticketPromedio)}</div>
            </div>
            <div className="stat-card">
              <div className="label">Unidades vendidas</div>
              <div className="value">{resumen.unidadesVendidas}</div>
            </div>
            <div className="stat-card">
              <div className="label">Gastos</div>
              <div className="value negative">{formatoMoneda(resumen.totalGastos)}</div>
            </div>
            <div className="stat-card">
              <div className="label">Costo de ventas</div>
              <div className="value">{formatoMoneda(resumen.costoVentas)}</div>
            </div>
            <div className="stat-card">
              <div className="label">Gasto en pauta (Meta Ads)</div>
              <div className="value negative">{formatoMoneda(resumen.gastoPauta)}</div>
            </div>
            <div className="stat-card">
              <div className="label">ROAS</div>
              <div className="value">{resumen.roas != null ? `${resumen.roas.toFixed(2)}x` : "-"}</div>
            </div>
          </div>

          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h4 style={{ margin: 0 }}>Ventas por dia</h4>
              <BotonesExportar
                nombreArchivo="ventas-por-dia"
                titulo="Ventas por dia"
                columnas={COLUMNAS_VENTAS_DIA}
                filas={resumen.ventasPorDia}
              />
            </div>
            <LineChart datos={resumen.ventasPorDia.map((d) => ({ etiqueta: d.fecha, valor: d.total }))} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
            <div className="card">
              <h4 style={{ marginTop: 0, marginBottom: 12 }}>Ventas por metodo de pago</h4>
              <DonutChart datos={resumen.ventasPorMetodoPago.map((m) => ({ etiqueta: m.metodoPago, valor: m.total }))} />
            </div>
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h4 style={{ margin: 0 }}>Ventas por sucursal</h4>
                <BotonesExportar
                  nombreArchivo="ventas-por-sucursal"
                  titulo="Ventas por sucursal"
                  columnas={COLUMNAS_VENTAS_SUCURSAL}
                  filas={resumen.ventasPorSucursal}
                />
              </div>
              <BarraHorizontal datos={resumen.ventasPorSucursal.map((s) => ({ etiqueta: s.sucursalNombre, valor: s.total }))} />
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h4 style={{ margin: 0 }}>Productos mas vendidos (por unidades)</h4>
              <BotonesExportar
                nombreArchivo="productos-mas-vendidos"
                titulo="Productos mas vendidos"
                columnas={COLUMNAS_PRODUCTOS_VENDIDOS}
                filas={resumen.productosMasVendidos}
              />
            </div>
            <BarraHorizontal
              datos={resumen.productosMasVendidos.map((p) => ({ etiqueta: p.nombre, valor: p.cantidad }))}
              color="var(--brand)"
              formato={(v) => `${v} u.`}
            />
          </div>
        </>
      )}
    </div>
  );
}

const COLUMNAS_VENTAS_DIA: ColumnaExport<Resumen["ventasPorDia"][number]>[] = [
  { encabezado: "Fecha", clave: "fecha" },
  { encabezado: "Total", clave: "total", formato: (v) => formatoMoneda(v) },
];

const COLUMNAS_VENTAS_SUCURSAL: ColumnaExport<Resumen["ventasPorSucursal"][number]>[] = [
  { encabezado: "Sucursal", clave: "sucursalNombre" },
  { encabezado: "Total", clave: "total", formato: (v) => formatoMoneda(v) },
];

const COLUMNAS_PRODUCTOS_VENDIDOS: ColumnaExport<Resumen["productosMasVendidos"][number]>[] = [
  { encabezado: "Producto", clave: "nombre" },
  { encabezado: "Unidades", clave: "cantidad" },
  { encabezado: "Total", clave: "total", formato: (v) => formatoMoneda(v) },
];
