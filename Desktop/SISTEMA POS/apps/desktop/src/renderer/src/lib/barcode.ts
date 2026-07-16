import JsBarcode from "jsbarcode";

// Genera el SVG (como string) de un codigo de barras Code128 a partir de
// cualquier texto (SKU o codigo de barras). Se usa tanto para la vista
// previa en pantalla como para incrustarlo en la hoja de etiquetas a imprimir.
export function generarSvgCodigoBarras(valor: string): string {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(svg, valor, {
    format: "CODE128",
    displayValue: true,
    fontSize: 12,
    height: 40,
    margin: 4,
  });
  return new XMLSerializer().serializeToString(svg);
}
