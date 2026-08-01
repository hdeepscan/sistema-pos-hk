import type { ReciboData } from "./api-types.js";

// Funcion pura (sin Electron) para poder reutilizarla tanto al imprimir
// (main process) como en la vista previa en vivo de Configuracion > Plantilla
// del recibo (renderer). Los datos obligatorios de una venta (items,
// cantidades, precios, total, fecha, factura) siempre se muestran, sin
// importar que traiga o no traiga la plantilla.
export function construirReciboHtml(data: ReciboData): string {
  const p = data.plantilla;
  const filas = data.items
    .map(
      (i) => `
      <tr>
        <td>${i.cantidad}x ${escapeHtml(i.nombre)}</td>
        <td style="text-align:right">${(i.cantidad * i.precioUnitario).toFixed(2)}</td>
      </tr>`
    )
    .join("");

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: monospace; width: 280px; font-size: 12px; }
          h2 { text-align: center; margin: 4px 0; }
          .center { text-align: center; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          .total { font-weight: bold; font-size: 14px; margin-top: 8px; }
          hr { border: none; border-top: 1px dashed #000; }
          img.logo { display: block; margin: 0 auto 4px; max-width: 140px; max-height: 80px; }
          img.promo { display: block; margin: 8px auto 0; max-width: 260px; }
          img.qr { display: block; margin: 8px auto 0; width: 90px; height: 90px; }
          .cupon { border: 1px dashed #000; padding: 6px; text-align: center; margin-top: 8px; font-weight: bold; }
        </style>
      </head>
      <body>
        ${p?.logoUrl ? `<img class="logo" src="${p.logoUrl}" />` : ""}
        <h2>${escapeHtml(data.empresaNombre)}</h2>
        <div class="center">${escapeHtml(data.sucursalNombre)}</div>
        ${p?.direccion ? `<div class="center">${escapeHtml(p.direccion)}</div>` : ""}
        ${p?.telefono ? `<div class="center">Tel: ${escapeHtml(p.telefono)}</div>` : ""}
        ${p?.email ? `<div class="center">${escapeHtml(p.email)}</div>` : ""}
        ${p?.redesSociales ? `<div class="center">${escapeHtml(p.redesSociales)}</div>` : ""}
        <hr />
        <div class="center">Comprobante de venta No. ${data.consecutivo}</div>
        <div class="center">${escapeHtml(data.fecha)}</div>
        <div>Cajero: ${escapeHtml(data.cajero)}</div>
        <hr />
        <table>${filas}</table>
        <hr />
        ${data.subtotal !== undefined && (data.descuento || data.valorPuntosRedimidos) ? `<div>Subtotal: $${data.subtotal.toFixed(2)}</div>` : ""}
        ${data.descuento ? `<div>Descuento: -$${data.descuento.toFixed(2)}</div>` : ""}
        ${data.valorPuntosRedimidos ? `<div>Puntos canjeados (${data.puntosRedimidos ?? 0}): -$${data.valorPuntosRedimidos.toFixed(2)}</div>` : ""}
        ${data.impuesto ? `<div>Base gravable: $${(data.total - data.impuesto).toFixed(2)}</div><div>IVA incluido: $${data.impuesto.toFixed(2)}</div>` : ""}
        <div class="total">TOTAL: $${data.total.toFixed(2)}</div>
        <div>Pago: ${escapeHtml(data.metodoPago)}</div>
        ${data.dineroRecibido !== undefined ? `<div>Recibido: $${data.dineroRecibido.toFixed(2)}</div>` : ""}
        ${data.cambio !== undefined ? `<div>Cambio: $${data.cambio.toFixed(2)}</div>` : ""}
        ${data.puntosGanados ? `<div>Puntos ganados: ${data.puntosGanados} · Saldo: ${data.puntosSaldo ?? "-"}</div>` : ""}
        <hr />
        <div class="center">${p?.mensajeAgradecimiento ? escapeHtml(p.mensajeAgradecimiento) : "¡Gracias por su compra!"}</div>
        ${p?.politicasCambios ? `<div class="center" style="margin-top:6px">${escapeHtml(p.politicasCambios)}</div>` : ""}
        ${p?.cuponDescuento ? `<div class="cupon">${escapeHtml(p.cuponDescuento)}</div>` : ""}
        ${p?.promociones ? `<div class="center" style="margin-top:6px">${escapeHtml(p.promociones)}</div>` : ""}
        ${p?.imagenPromocionalUrl ? `<img class="promo" src="${p.imagenPromocionalUrl}" />` : ""}
        ${p?.qrDataUrl ? `<img class="qr" src="${p.qrDataUrl}" />` : ""}
        ${p?.piePagina ? `<div class="center" style="margin-top:6px">${escapeHtml(p.piePagina)}</div>` : ""}
        <hr />
        <div class="center" style="font-size:10px">Sistema desarrollado por POS HK.</div>
      </body>
    </html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
