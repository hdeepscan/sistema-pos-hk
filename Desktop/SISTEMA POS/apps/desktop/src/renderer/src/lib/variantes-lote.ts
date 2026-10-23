// Utilidades para editar variantes en lote ("poner 10 de stock a todas las tallas L").
// Una variante se identifica por sus valores en orden (ej. ["L", "Rojo"]) y los nombres de
// las opciones (ej. ["Talla", "Color"]).

export interface OpcionFiltroLote {
  valor: string; // "todas" o "<indice>::<valor>"
  etiqueta: string;
}

export const FILTRO_TODAS = "todas";

export function valoresDeTitulo(titulo: string | null | undefined): string[] {
  return titulo ? titulo.split(" / ").map((v) => v.trim()).filter(Boolean) : [];
}

/** Opciones para el selector "Aplicar a": todas, o las que tengan un valor (Talla: L, Color: Rojo...). */
export function opcionesFiltroLote(variantes: string[][], nombresOpciones: string[]): OpcionFiltroLote[] {
  const opciones: OpcionFiltroLote[] = [{ valor: FILTRO_TODAS, etiqueta: "Todas las variantes" }];
  const vistos = new Set<string>();
  for (const valores of variantes) {
    valores.forEach((v, i) => {
      const clave = `${i}::${v}`;
      if (vistos.has(clave)) return;
      vistos.add(clave);
      opciones.push({ valor: clave, etiqueta: `${nombresOpciones[i] || `Opción ${i + 1}`}: ${v}` });
    });
  }
  // Agrupadas por opción (todas las tallas, luego todos los colores), en el orden en que aparecen.
  return [opciones[0], ...opciones.slice(1).sort((a, b) => Number(a.valor.split("::")[0]) - Number(b.valor.split("::")[0]))];
}

export function coincideFiltroLote(valores: string[], filtro: string): boolean {
  if (filtro === FILTRO_TODAS) return true;
  const separador = filtro.indexOf("::");
  const indice = Number(filtro.slice(0, separador));
  return valores[indice] === filtro.slice(separador + 2);
}

// Abreviatura de un valor, igual que al crear el producto ("ROJO" -> "ROJ", "42" -> "42").
export function abreviarValor(texto: string): string {
  const limpio = texto.trim();
  if (/^\d+$/.test(limpio)) return limpio;
  return limpio
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 3)
    .toUpperCase();
}

/**
 * Si el SKU se armó con los valores de la variante ("BLU-L-ROJ" para "L / Rojo"), devuelve el SKU
 * con los valores nuevos. null si el SKU no depende de los valores (no hace falta cambiarlo).
 * Misma regla que usa el servidor al guardar.
 */
export function skuConNuevosValores(sku: string, valoresViejos: string[], valoresNuevos: string[]): string | null {
  const viejo = valoresViejos.map(abreviarValor).filter(Boolean).join("-");
  const nuevo = valoresNuevos.map(abreviarValor).filter(Boolean).join("-");
  if (!viejo || !nuevo || viejo === nuevo) return null;
  const m = sku.match(new RegExp(`^(.*)-${viejo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(-\\d+)?$`, "i"));
  return m ? `${m[1]}-${nuevo}` : null;
}
