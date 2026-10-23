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
