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
        <td style="text-align:right">$${(i.cantidad * i.precioUnitario).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>`
    )
    .join("");

  const htmlContent = `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Courier New', monospace;
            width: 80mm;
            font-size: 11px;
            line-height: 1.2;
            padding: 0;
            background: white;
          }
          h2 { text-align: center; margin: 3px 0; font-size: 13px; font-weight: bold; }
          .center { text-align: center; }
          table { width: 100%; border-collapse: collapse; margin: 3px 0; }
          td { padding: 2px 0; }
          td:last-child { text-align: right; }
          .total { font-weight: bold; font-size: 13px; margin: 3px 0; text-align: center; }
          hr { border: none; border-top: 1px dashed #000; margin: 2px 0; }
          img.logo { display: block; margin: 2px auto; max-width: 70mm; max-height: 50px; }
          img.promo { display: block; margin: 3px auto; max-width: 75mm; }
          img.qr { display: block; margin: 3px auto; width: 60px; height: 60px; }
          .cupon { border: 1px dashed #000; padding: 3px; text-align: center; margin: 3px 0; font-weight: bold; font-size: 10px; }
          .footer { font-size: 9px; text-align: center; margin: 2px 0; }
          .valor { text-align: right; display: inline-block; width: 100%; }
        </style>
      </head>
      <body>
        ${p?.logoUrl ? `<img class="logo" src="${p.logoUrl}" alt="Logo" />` : ""}
        <h2>${escapeHtml(data.empresaNombre)}</h2>
        <div class="center">${escapeHtml(data.sucursalNombre)}</div>
        ${p?.direccion ? `<div class="center" style="font-size:10px">${escapeHtml(p.direccion)}</div>` : ""}
        ${p?.telefono ? `<div class="center" style="font-size:10px">Tel: ${escapeHtml(p.telefono)}</div>` : ""}
        ${p?.email ? `<div class="center" style="font-size:10px">${escapeHtml(p.email)}</div>` : ""}
        ${p?.redesSociales ? `<div class="center" style="font-size:10px">${escapeHtml(p.redesSociales)}</div>` : ""}
        <hr />
        <div class="center">Comprobante de Venta</div>
        <div class="center">No. ${data.consecutivo}</div>
        <div class="center" style="font-size:10px">${escapeHtml(data.fecha)}</div>
        <div style="font-size:10px">Cajero: ${escapeHtml(data.cajero)}</div>
        <hr />
        <table>${filas}</table>
        <hr />
        ${data.subtotal !== undefined && (data.descuento || data.valorPuntosRedimidos) ? `<div>Subtotal:<span class="valor">$${data.subtotal.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</span></div>` : ""}
        ${data.descuento ? `<div>Descuento:<span class="valor">-$${data.descuento.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</span></div>` : ""}
        ${data.valorPuntosRedimidos ? `<div>Puntos:<span class="valor">-$${data.valorPuntosRedimidos.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</span></div>` : ""}
        ${data.impuesto ? `<div>Base:<span class="valor">$${(data.total - data.impuesto).toLocaleString("es-CO", { minimumFractionDigits: 2 })}</span></div><div>IVA:<span class="valor">$${data.impuesto.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</span></div>` : ""}
        <div class="total">TOTAL: $${data.total.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</div>
        <div>Pago: ${escapeHtml(data.metodoPago)}</div>
        ${data.dineroRecibido !== undefined ? `<div>Recibido:<span class="valor">$${data.dineroRecibido.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</span></div>` : ""}
        ${data.cambio !== undefined ? `<div>Cambio:<span class="valor">$${data.cambio.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</span></div>` : ""}
        ${data.puntosGanados ? `<div style="font-size:10px">Puntos: +${data.puntosGanados} | Saldo: ${data.puntosSaldo ?? "-"}</div>` : ""}
        <hr />
        <div class="center">${p?.mensajeAgradecimiento ? escapeHtml(p.mensajeAgradecimiento) : "¡Gracias por su compra!"}</div>
        ${p?.politicasCambios ? `<div class="center" style="font-size:9px;margin-top:2px">${escapeHtml(p.politicasCambios)}</div>` : ""}
        ${p?.cuponDescuento ? `<div class="cupon">${escapeHtml(p.cuponDescuento)}</div>` : ""}
        ${p?.promociones ? `<div class="center" style="font-size:10px;margin-top:2px">${escapeHtml(p.promociones)}</div>` : ""}
        ${p?.imagenPromocionalUrl ? `<img class="promo" src="${p.imagenPromocionalUrl}" alt="Promocion" />` : ""}
        ${p?.qrDataUrl ? `<img class="qr" src="${p.qrDataUrl}" alt="QR" />` : ""}
        ${p?.piePagina ? `<div class="center" style="font-size:9px;margin-top:2px">${escapeHtml(p.piePagina)}</div>` : ""}
        <hr />
        <div class="footer">Desarrollado por POS HK</div>
      </body>
    </html>`;

  return htmlContent;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
