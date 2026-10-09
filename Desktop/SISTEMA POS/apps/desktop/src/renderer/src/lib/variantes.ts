// Shopify llama "Default Title" a la única variante de un producto sin tallas ni colores.
const SIN_VARIANTE = new Set(["default title", "default"]);

export function textoVariante(varianteTitulo?: string | null): string | null {
  const v = varianteTitulo?.trim();
  return v && !SIN_VARIANTE.has(v.toLowerCase()) ? v : null;
}

export function nombreConVariante(p: { nombre: string; varianteTitulo?: string | null }): string {
  const v = textoVariante(p.varianteTitulo);
  return v ? `${p.nombre} · ${v}` : p.nombre;
}
