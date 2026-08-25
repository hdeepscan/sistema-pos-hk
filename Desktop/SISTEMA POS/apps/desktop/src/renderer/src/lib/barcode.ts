import JsBarcode from "jsbarcode";

// Genera un SKU corto aleatorio (8 caracteres: 4 letras + 4 números)
// Mucho más compacto que EAN-13 (13 dígitos) - ideal para etiquetas térmicas
// Ejemplo: "ABC12345", "XYZ98765"
export function generarSKUCorto(): string {
  const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let sku = "";
  // 4 letras aleatorias
  for (let i = 0; i < 4; i++) {
    sku += letras.charAt(Math.floor(Math.random() * letras.length));
  }
  // 4 números aleatorios
  for (let i = 0; i < 4; i++) {
    sku += Math.floor(Math.random() * 10);
  }
  return sku;
}

// Genera un codigo de barras EAN-13 valido (numerico, con digito verificador)
// con prefijo interno de tienda (20x), corto y legible por cualquier lector.
// DEPRECADO: Usar generarSKUCorto() en su lugar para códigos más compactos
export function generarCodigoBarrasEan13(): string {
  let base = "20";
  for (let i = 0; i < 10; i++) base += Math.floor(Math.random() * 10);
  let suma = 0;
  for (let i = 0; i < 12; i++) suma += Number(base[i]) * (i % 2 === 0 ? 1 : 3);
  const verificador = (10 - (suma % 10)) % 10;
  return base + verificador;
}

// Genera el SVG (como string) de un codigo de barras a partir de cualquier
// texto (codigo de barras numerico o SKU). Si el valor es un codigo de 13
// digitos (EAN-13, que es lo que genera el sistema automaticamente) se usa el
// formato EAN-13, que queda mas compacto y corto que el Code128. Para SKU u
// otros textos se usa Code128, que admite letras y guiones.
export function generarSvgCodigoBarras(valor: string): string {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  // Menos margen (zona muda) y mas alto: el codigo aprovecha mejor la etiqueta
  // 50x25mm y el numero se lee mas grande.
  const opcionesBase = { displayValue: true, fontSize: 16, height: 60, margin: 2, textMargin: 1 };
  if (/^\d{13}$/.test(valor)) {
    try {
      JsBarcode(svg, valor, { ...opcionesBase, format: "EAN13" });
      return new XMLSerializer().serializeToString(svg);
    } catch {
      // Digito verificador invalido: caemos a Code128.
    }
  }
  JsBarcode(svg, valor, { ...opcionesBase, format: "CODE128" });
  return new XMLSerializer().serializeToString(svg);
}
