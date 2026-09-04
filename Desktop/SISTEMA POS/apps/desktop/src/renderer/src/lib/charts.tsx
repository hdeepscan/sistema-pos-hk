import { useState } from "react";

// Paleta categorica de orden fijo (no se reasigna dinamicamente). Se usa solo
// para series con pocas categorias con identidad real (metodo de pago,
// sucursal). Para rankings de magnitud (top productos) se usa un solo tono.
export const PALETA_CATEGORICA = ["#4f46e5", "#059669", "#d97706", "#0891b2", "#db2777", "#6b7280"];

export function formatoMoneda(valor: number): string {
  return `$${Math.round(valor).toLocaleString("es-CO")}`;
}

interface PuntoSerie {
  etiqueta: string;
  valor: number;
}

export function LineChart({ datos, alto = 180 }: { datos: PuntoSerie[]; alto?: number }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const ancho = 640;
  const margenIzq = 8;
  const margenDer = 8;
  const margenAbajo = 22;
  const areaAlto = alto - margenAbajo;
  const max = Math.max(1, ...datos.map((d) => d.valor));
  const paso = datos.length > 1 ? (ancho - margenIzq - margenDer) / (datos.length - 1) : 0;

  const puntos = datos.map((d, i) => ({
    x: margenIzq + i * paso,
    y: areaAlto - (d.valor / max) * (areaAlto - 10),
    ...d,
  }));

  const lineaPath = puntos.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${lineaPath} L${puntos[puntos.length - 1]?.x ?? 0},${areaAlto} L${puntos[0]?.x ?? 0},${areaAlto} Z`;

  // Muestra a lo sumo ~7 etiquetas en el eje X para que no se amontonen.
  const saltoEtiqueta = Math.max(1, Math.ceil(datos.length / 7));

  if (datos.length === 0) return <p className="empty-state">Sin datos en el rango seleccionado</p>;

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${ancho} ${alto}`} width="100%" height={alto} preserveAspectRatio="none">
        <line x1={margenIzq} y1={areaAlto} x2={ancho - margenDer} y2={areaAlto} stroke="var(--border)" strokeWidth={1} />
        <path d={areaPath} fill="var(--brand)" opacity={0.08} stroke="none" />
        <path d={lineaPath} fill="none" stroke="var(--brand)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {puntos.map((p, i) => (
          <g key={i}>
            <rect
              x={p.x - paso / 2}
              y={0}
              width={paso || ancho}
              height={areaAlto}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx((cur) => (cur === i ? null : cur))}
            />
            {(hoverIdx === i || datos.length === 1) && (
              <circle cx={p.x} cy={p.y} r={4} fill="var(--brand)" stroke="var(--surface)" strokeWidth={2} />
            )}
            {i % saltoEtiqueta === 0 && (
              <text x={p.x} y={alto - 4} fontSize={9} fill="var(--text-muted)" textAnchor="middle">
                {p.etiqueta.slice(5)}
              </text>
            )}
          </g>
        ))}
      </svg>
      {hoverIdx !== null && puntos[hoverIdx] && (
        <div
          style={{
            position: "absolute",
            left: `${(puntos[hoverIdx].x / ancho) * 100}%`,
            top: 0,
            transform: "translate(-50%, -100%)",
            background: "#111827",
            color: "#fff",
            fontSize: 12,
            padding: "4px 8px",
            borderRadius: 6,
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          {puntos[hoverIdx].etiqueta}: {formatoMoneda(puntos[hoverIdx].valor)}
        </div>
      )}
    </div>
  );
}

export function BarraHorizontal({
  datos,
  color = "var(--brand)",
  formato = formatoMoneda,
}: {
  datos: { etiqueta: string; valor: number }[];
  color?: string;
  formato?: (v: number) => string;
}) {
  if (datos.length === 0) return <p className="empty-state">Sin datos</p>;
  const max = Math.max(1, ...datos.map((d) => d.valor));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {datos.map((d) => (
        <div key={d.etiqueta}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{d.etiqueta}</span>
            <span style={{ fontWeight: 600 }}>{formato(d.valor)}</span>
          </div>
          <div style={{ background: "#f3f4f6", borderRadius: 999, height: 8 }}>
            <div
              style={{
                width: `${(d.valor / max) * 100}%`,
                background: color,
                height: 8,
                borderRadius: 999,
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DonutChart({
  datos,
  colores = PALETA_CATEGORICA,
}: {
  datos: { etiqueta: string; valor: number }[];
  colores?: string[];
}) {
  const total = datos.reduce((acc, d) => acc + d.valor, 0);
  if (total === 0) return <p className="empty-state">Sin datos</p>;

  const radio = 15.9155;
  let acumulado = 0;
  const segmentos = datos.map((d, i) => {
    const pct = (d.valor / total) * 100;
    const dasharray = `${pct} ${100 - pct}`;
    const dashoffset = 25 - acumulado;
    acumulado += pct;
    return { ...d, pct, dasharray, dashoffset, color: colores[i % colores.length] };
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <svg viewBox="0 0 36 36" width={140} height={140}>
        {segmentos.map((s, i) => (
          <circle
            key={i}
            cx="18"
            cy="18"
            r={radio}
            fill="none"
            stroke={s.color}
            strokeWidth="4"
            strokeDasharray={s.dasharray}
            strokeDashoffset={s.dashoffset}
          >
            <title>{`${s.etiqueta}: ${formatoMoneda(s.valor)} (${s.pct.toFixed(0)}%)`}</title>
          </circle>
        ))}
        <text x="18" y="19" textAnchor="middle" fontSize="5.5" fontWeight={700} fill="var(--text)">
          {formatoMoneda(total)}
        </text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {segmentos.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span>{s.etiqueta}</span>
            <span style={{ color: "var(--text-muted)" }}>{s.pct.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function VariacionBadge({ valor }: { valor: number | null }) {
  if (valor === null) return null;
  const positivo = valor >= 0;
  return (
    <span className={`badge ${positivo ? "success" : "danger"}`} style={{ marginLeft: 8 }}>
      {positivo ? "▲" : "▼"} {Math.abs(valor).toFixed(1)}% vs periodo anterior
    </span>
  );
}
