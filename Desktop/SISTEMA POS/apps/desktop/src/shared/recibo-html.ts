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
          /* Reset de estilos */
          * { margin: 0; padding: 0; box-sizing: border-box; }

          /* Configuración para pantalla (vista previa) */
          html, body {
            margin: 0;
            padding: 0;
            background: #f5f5f5;
          }

          body {
            font-family: 'Courier New', Courier, monospace;
            width: 80mm;
            margin: 10px auto;
            padding: 0;
            background: white;
            font-size: 11px;
            line-height: 1.3;
            color: #000000;
            font-weight: 700;
            /* NITIDEZ TÉRMICA: Desactivar antialiasing */
            -webkit-font-smoothing: none;
            font-smooth: never;
            text-rendering: geometricPrecision;
            image-rendering: pixelated;
          }

          /* Estilos para pantalla */
          h2 {
            text-align: center;
            margin: 4px 0;
            font-size: 14px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #000000;
            -webkit-font-smoothing: none;
          }

          .center {
            text-align: center;
            word-break: break-word;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin: 3px 0;
            table-layout: fixed;
          }

          td {
            padding: 2px 0;
            word-break: break-word;
            overflow-wrap: break-word;
            color: #000000;
            font-weight: 900;
            -webkit-font-smoothing: none;
          }

          td:first-child {
            text-align: left;
            padding-right: 4px;
            flex: 1;
          }

          td:last-child {
            text-align: right;
            padding-left: 4px;
            white-space: nowrap;
          }

          .total {
            font-weight: 900;
            font-size: 14px;
            margin: 4px 0;
            text-align: center;
            text-transform: uppercase;
            border-top: 1px dashed #000;
            border-bottom: 1px dashed #000;
            padding: 3px 0;
          }

          hr {
            border: none;
            border-top: 1px dashed #000;
            margin: 3px 0;
          }

          img.logo {
            display: block;
            margin: 3px auto;
            max-width: 70mm;
            max-height: 40px;
            height: auto;
          }

          img.promo {
            display: block;
            margin: 3px auto;
            max-width: 76mm;
            height: auto;
          }

          img.qr {
            display: block;
            margin: 3px auto;
            width: 50px;
            height: 50px;
          }

          .cupon {
            border: 1px dashed #000;
            padding: 3px;
            text-align: center;
            margin: 3px 0;
            font-weight: 900;
            font-size: 10px;
            word-break: break-word;
            color: #000000;
            -webkit-font-smoothing: none;
          }

          .footer {
            font-size: 9px;
            text-align: center;
            margin: 3px 0;
            color: #000000;
            font-weight: 700;
            -webkit-font-smoothing: none;
          }

          .valor {
            text-align: right;
            display: inline-block;
            width: 100%;
            padding-left: 4px;
          }

          /* REGLA CRÍTICA PARA IMPRESIÓN */
          @page {
            size: 80mm auto;
            margin: 0;
            padding: 0;
          }

          @media print {
            html, body {
              margin: 0;
              padding: 0;
              background: white;
              width: 80mm;
            }

            body {
              width: 80mm !important;
              margin: 0;
              padding: 0;
              font-size: 10px;
              line-height: 1.25;
              font-weight: 700;
            }

            h2 {
              font-size: 13px;
              margin: 2px 0;
              font-weight: 900;
            }

            table {
              margin: 2px 0;
              width: 100%;
              table-layout: fixed;
            }

            td {
              padding: 1px 0;
              font-size: 10px;
              word-break: break-word;
              font-weight: 900;
            }

            td:first-child {
              max-width: 50mm;
              word-break: break-word;
              flex-basis: auto;
            }

            td:last-child {
              max-width: 25mm;
              text-align: right;
              padding-left: 2px;
            }

            .total {
              font-size: 12px;
              margin: 2px 0;
              padding: 2px 0;
              font-weight: 900;
            }

            hr {
              margin: 2px 0;
              border: none;
              border-top: 1px dashed #000;
            }

            img.logo {
              max-width: 76mm;
              max-height: 30px;
              margin: 2px auto;
              display: block;
            }

            img.promo {
              max-width: 76mm;
              margin: 2px auto;
              display: block;
            }

            .footer {
              font-size: 8px;
              margin: 2px 0;
              font-weight: 700;
            }

            .cupon {
              font-size: 9px;
              padding: 2px;
              margin: 2px 0;
              font-weight: 900;
            }

            /* Estilos para distribución de líneas */
            div[style*="display:flex"] {
              display: flex !important;
              justify-content: space-between !important;
              width: 100%;
              margin: 1px 0;
              padding: 0;
            }

            div[style*="display:flex"] span {
              flex-grow: 0;
              word-break: break-word;
            }

            div[style*="display:flex"] span:last-child {
              text-align: right;
              flex-grow: 0;
              padding-left: 4px;
              white-space: nowrap;
            }

            /* Eliminar espacios en blanco de más */
            div {
              margin: 0;
              padding: 0;
              line-height: 1.25;
            }
          }
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
        ${data.subtotal !== undefined && (data.descuento || data.valorPuntosRedimidos) ? `<div style="display:flex;justify-content:space-between"><span>Subtotal:</span><span style="text-align:right">$${data.subtotal.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</span></div>` : ""}
        ${data.descuento ? `<div style="display:flex;justify-content:space-between"><span>Descuento:</span><span style="text-align:right">-$${data.descuento.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</span></div>` : ""}
        ${data.valorPuntosRedimidos ? `<div style="display:flex;justify-content:space-between"><span>Puntos:</span><span style="text-align:right">-$${data.valorPuntosRedimidos.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</span></div>` : ""}
        ${data.impuesto ? `<div style="display:flex;justify-content:space-between"><span>Base:</span><span style="text-align:right">$${(data.total - data.impuesto).toLocaleString("es-CO", { minimumFractionDigits: 2 })}</span></div><div style="display:flex;justify-content:space-between"><span>IVA:</span><span style="text-align:right">$${data.impuesto.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</span></div>` : ""}
        <div class="total">TOTAL: $${data.total.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</div>
        <div style="display:flex;justify-content:space-between"><span>Pago:</span><span>${escapeHtml(data.metodoPago)}</span></div>
        ${data.dineroRecibido !== undefined ? `<div style="display:flex;justify-content:space-between"><span>Recibido:</span><span style="text-align:right">$${data.dineroRecibido.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</span></div>` : ""}
        ${data.cambio !== undefined ? `<div style="display:flex;justify-content:space-between"><span>Cambio:</span><span style="text-align:right">$${data.cambio.toLocaleString("es-CO", { minimumFractionDigits: 2 })}</span></div>` : ""}
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
        <div class="footer">Powered by CENTRALA</div>
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
