import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
import { leerArchivoComoDataUrl } from "../lib/files";
import { mensajeError } from "../lib/errores";

interface Proveedor {
  id: string;
  nombre: string;
}

interface GrupoVariante {
  id: string;
  nombre: string;
  valores: string[];
}

interface ImagenSubida {
  id: string;
  dataUrl: string;
  nombre: string;
}

// Ajustes por combinacion (sku/codigo/precio/stock/imagen propios).
interface OverrideVariante {
  sku?: string;
  codigoBarras?: string;
  precio?: string;
  stock?: string;
  imagenId?: string;
}

const GRUPOS_SUGERIDOS = ["Talla", "Color", "Material", "Modelo"];

function abreviar(texto: string): string {
  const limpio = texto.trim();
  if (/^\d+$/.test(limpio)) return limpio;
  return limpio
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 3)
    .toUpperCase();
}

// Sugiere un SKU legible a partir del nombre: iniciales/abreviaturas por
// palabra + consecutivo. Ej. "Nike Air Max 90" -> "NIK-AIR-MAX-90-001".
function sugerirSku(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return "";
  const partes = palabras.slice(0, 4).map(abreviar).filter(Boolean);
  return partes.length ? `${partes.join("-")}-001` : "";
}

// Genera un codigo de barras EAN-13 valido con prefijo interno de tienda (20x),
// para que cualquier lector lo lea. El ultimo digito es el verificador.
function generarCodigoBarras(): string {
  let base = "20";
  for (let i = 0; i < 10; i++) base += Math.floor(Math.random() * 10);
  let suma = 0;
  for (let i = 0; i < 12; i++) suma += Number(base[i]) * (i % 2 === 0 ? 1 : 3);
  const verificador = (10 - (suma % 10)) % 10;
  return base + verificador;
}

function skuBase(sku: string): string {
  return sku.replace(/-\d+$/, ""); // quita el consecutivo final
}

// Producto cartesiano de los valores de todos los grupos.
function combinar(grupos: GrupoVariante[]): string[][] {
  const activos = grupos.filter((g) => g.valores.length > 0);
  if (activos.length === 0) return [];
  return activos.reduce<string[][]>(
    (acc, grupo) => acc.flatMap((combo) => grupo.valores.map((v) => [...combo, v])),
    [[]]
  );
}

export function NuevoProductoInteligente({
  onClose,
  onCreado,
}: {
  onClose: () => void;
  onCreado: () => void;
}) {
  const { sucursales } = useSesionStore();
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);

  // Campos base
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [marca, setMarca] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [costo, setCosto] = useState("0");
  const [precio, setPrecio] = useState("");
  const [codigoBarras, setCodigoBarras] = useState("");
  const [codigoManual, setCodigoManual] = useState(false);
  const [sku, setSku] = useState("");
  const [skuManual, setSkuManual] = useState(false);
  const [descripcion, setDescripcion] = useState("");
  const [impuesto, setImpuesto] = useState("0");
  const [activo, setActivo] = useState(true);

  // Stock / disponibilidad
  const [sucursalStockId, setSucursalStockId] = useState("");
  const [stockInicial, setStockInicial] = useState("0");
  const [modoSucursales, setModoSucursales] = useState<"todas" | "algunas">("todas");
  const [sucursalIds, setSucursalIds] = useState<string[]>([]);

  // Variantes
  const [grupos, setGrupos] = useState<GrupoVariante[]>([]);
  const [overrides, setOverrides] = useState<Record<string, OverrideVariante>>({});
  // Codigo de barras autogenerado por combinacion (unico para cada variante).
  const [autoBarras, setAutoBarras] = useState<Record<string, string>>({});

  // Imagenes
  const [imagenes, setImagenes] = useState<ImagenSubida[]>([]);

  // Shopify
  const [shopifyConectado, setShopifyConectado] = useState(false);
  const [publicarShopify, setPublicarShopify] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [avisoSync, setAvisoSync] = useState<string | null>(null);
  const [creado, setCreado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api.get<Proveedor[]>("/proveedores").then(({ data }) => setProveedores(data)).catch(() => setProveedores([]));
    api.get<string[]>("/productos/categorias").then(({ data }) => setCategorias(data)).catch(() => setCategorias([]));
    api
      .get("/shopify/config")
      .then(({ data }) => setShopifyConectado(!!data.conectado))
      .catch(() => setShopifyConectado(false));
    if (sucursales.length > 0) setSucursalStockId(sucursales[0].id);
  }, [sucursales]);

  // Auto-SKU mientras el usuario no lo edite manualmente.
  useEffect(() => {
    if (!skuManual) setSku(sugerirSku(nombre));
  }, [nombre, skuManual]);

  // Codigo de barras automatico: al escribir el nombre se genera uno unico
  // (numerico) si el usuario no lo ha escrito a mano.
  useEffect(() => {
    if (!codigoManual && nombre.trim() && !codigoBarras) setCodigoBarras(generarCodigoBarras());
  }, [nombre, codigoManual, codigoBarras]);

  const combinaciones = useMemo(() => combinar(grupos), [grupos]);

  // Cada combinacion de variante recibe su propio codigo de barras unico.
  useEffect(() => {
    setAutoBarras((prev) => {
      let cambio = false;
      const siguiente = { ...prev };
      for (const valores of combinaciones) {
        const titulo = valores.join(" / ");
        if (!siguiente[titulo]) {
          siguiente[titulo] = generarCodigoBarras();
          cambio = true;
        }
      }
      return cambio ? siguiente : prev;
    });
  }, [combinaciones]);

  function alternarSucursal(id: string) {
    setSucursalIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  // ----- Grupos de variantes -----
  function agregarGrupo(nombreGrupo: string) {
    if (grupos.some((g) => g.nombre.toLowerCase() === nombreGrupo.toLowerCase())) return;
    setGrupos((prev) => [...prev, { id: crypto.randomUUID(), nombre: nombreGrupo, valores: [] }]);
  }

  function eliminarGrupo(id: string) {
    setGrupos((prev) => prev.filter((g) => g.id !== id));
  }

  function renombrarGrupo(id: string, nombreGrupo: string) {
    setGrupos((prev) => prev.map((g) => (g.id === id ? { ...g, nombre: nombreGrupo } : g)));
  }

  function agregarValores(id: string, texto: string) {
    const nuevos = texto
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (nuevos.length === 0) return;
    setGrupos((prev) =>
      prev.map((g) =>
        g.id === id ? { ...g, valores: [...new Set([...g.valores, ...nuevos])] } : g
      )
    );
  }

  function quitarValor(id: string, valor: string) {
    setGrupos((prev) => prev.map((g) => (g.id === id ? { ...g, valores: g.valores.filter((v) => v !== valor) } : g)));
  }

  // ----- Imagenes -----
  async function agregarArchivos(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const nuevas: ImagenSubida[] = [];
    for (const f of arr) {
      const dataUrl = await leerArchivoComoDataUrl(f);
      nuevas.push({ id: crypto.randomUUID(), dataUrl, nombre: f.name });
    }
    setImagenes((prev) => [...prev, ...nuevas]);
  }

  function moverImagen(index: number, dir: -1 | 1) {
    setImagenes((prev) => {
      const arr = [...prev];
      const destino = index + dir;
      if (destino < 0 || destino >= arr.length) return prev;
      [arr[index], arr[destino]] = [arr[destino], arr[index]];
      return arr;
    });
  }

  function hacerPrincipal(index: number) {
    setImagenes((prev) => {
      if (index === 0) return prev;
      const arr = [...prev];
      const [img] = arr.splice(index, 1);
      return [img, ...arr];
    });
  }

  function quitarImagen(id: string) {
    setImagenes((prev) => prev.filter((i) => i.id !== id));
    setOverrides((prev) => {
      const copia = { ...prev };
      for (const k of Object.keys(copia)) {
        if (copia[k].imagenId === id) copia[k] = { ...copia[k], imagenId: undefined };
      }
      return copia;
    });
  }

  function setOverride(titulo: string, campo: keyof OverrideVariante, valor: string | undefined) {
    setOverrides((prev) => ({ ...prev, [titulo]: { ...prev[titulo], [campo]: valor } }));
  }

  function skuVariante(valores: string[]): string {
    return `${skuBase(sku)}-${valores.map(abreviar).join("-")}`;
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) return setError("El nombre es obligatorio");
    if (!sku.trim()) return setError("El SKU es obligatorio");
    if (!precio || Number(precio) < 0) return setError("Pon un precio de venta valido");
    // Validar que todo grupo agregado tenga al menos un valor.
    if (grupos.length > 0 && grupos.some((g) => g.valores.length === 0)) {
      return setError("Cada grupo de variantes debe tener al menos un valor, o eliminalo");
    }

    setGuardando(true);
    try {
      const imagenesDataUrl = imagenes.map((i) => i.dataUrl);
      const cuerpo: any = {
        nombre: nombre.trim(),
        sku: sku.trim(),
        categoria: categoria || undefined,
        marca: marca || undefined,
        descripcion: descripcion || undefined,
        impuestoPorcentaje: Number(impuesto || 0),
        precio: Number(precio),
        costo: Number(costo || 0),
        codigoBarras: codigoBarras || undefined,
        activo,
        proveedorId: proveedorId || undefined,
        sucursalIds: modoSucursales === "algunas" ? sucursalIds : undefined,
        sucursalStockId: sucursalStockId || undefined,
        imagenesDataUrl: imagenesDataUrl.length ? imagenesDataUrl : undefined,
        publicarEnShopify: publicarShopify,
      };

      if (combinaciones.length > 0) {
        // Nombres de las opciones en el mismo orden que aparecen en el titulo.
        cuerpo.nombresOpciones = grupos.filter((g) => g.valores.length > 0).map((g) => g.nombre);
        cuerpo.variantes = combinaciones.map((valores) => {
          const titulo = valores.join(" / ");
          const ov = overrides[titulo] ?? {};
          const img = ov.imagenId ? imagenes.find((i) => i.id === ov.imagenId) : undefined;
          return {
            titulo,
            sku: (ov.sku ?? skuVariante(valores)).trim(),
            codigoBarras: (ov.codigoBarras ?? autoBarras[titulo]) || undefined,
            precio: ov.precio ? Number(ov.precio) : undefined,
            stockInicial: ov.stock ? Number(ov.stock) : 0,
            imagenDataUrl: img?.dataUrl ?? undefined,
          };
        });
      } else {
        cuerpo.stockInicial = Number(stockInicial || 0);
      }

      const { data } = await api.post("/productos/completo", cuerpo);
      onCreado();
      // Si Shopify se intento pero fallo, avisamos y dejamos el modal abierto
      // para que el usuario lea la causa; el producto ya quedo creado local.
      if (data?.shopifySync?.intentado && !data.shopifySync.ok) {
        setCreado(true);
        setAvisoSync(
          `El producto se creo, pero fallo la sincronizacion con Shopify: ${
            data.shopifySync.error ?? "error desconocido"
          }. Puedes reintentar desde el producto (boton "Reintentar Shopify").`
        );
      } else {
        onClose();
      }
    } catch (err: any) {
      setError(mensajeError(err, "No se pudo crear el producto"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="card" style={{ width: 760, maxWidth: "94vw" }}>
        <h4 style={{ marginTop: 0, marginBottom: 4 }}>Nuevo producto</h4>
        <p style={{ marginTop: 0, fontSize: 12.5, color: "var(--text-muted)" }}>
          Configura todo en una sola pantalla. Si agregas variantes (ej. Color x Talla) se crean todas las combinaciones
          automaticamente.
        </p>
        <form className="grid-form" onSubmit={guardar}>
          {/* ---- Datos base ---- */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label>
              Nombre
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            </label>
            <label>
              Categoria
              <input
                list="categorias-existentes"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                placeholder="Escribe o elige una existente"
              />
              <datalist id="categorias-existentes">
                {categorias.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label>
              Marca
              <input value={marca} onChange={(e) => setMarca(e.target.value)} />
            </label>
            <label>
              Proveedor
              <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
                <option value="">Sin proveedor</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Precio de compra (costo)
              <input type="number" step="0.01" value={costo} onChange={(e) => setCosto(e.target.value)} />
            </label>
            <label>
              Precio de venta
              <input type="number" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} required />
            </label>
            <label>
              SKU (sugerido, editable)
              <input
                value={sku}
                onChange={(e) => {
                  setSkuManual(true);
                  setSku(e.target.value);
                }}
                required
              />
            </label>
            <label>
              Codigo de barras (automatico, editable)
              <input
                value={codigoBarras}
                onChange={(e) => {
                  setCodigoManual(true);
                  setCodigoBarras(e.target.value);
                }}
              />
            </label>
            <label>
              Impuesto (%)
              <input type="number" step="0.01" value={impuesto} onChange={(e) => setImpuesto(e.target.value)} />
            </label>
            <label style={{ flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "end" }}>
              <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} style={{ width: "auto" }} />
              Producto activo
            </label>
          </div>
          <label>
            Descripcion
            <textarea rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </label>

          {/* ---- Imagenes ---- */}
          <div>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)" }}>Imagenes del producto</span>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files.length) agregarArchivos(e.dataTransfer.files);
              }}
              style={{
                marginTop: 6,
                border: "1.5px dashed var(--border)",
                borderRadius: 8,
                padding: 12,
                textAlign: "center",
                fontSize: 12.5,
                color: "var(--text-muted)",
              }}
            >
              Arrastra imagenes aqui o{" "}
              <label style={{ display: "inline", color: "var(--brand)", cursor: "pointer", textDecoration: "underline" }}>
                seleccionalas
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => e.target.files && agregarArchivos(e.target.files)}
                />
              </label>
            </div>
            {imagenes.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
                {imagenes.map((img, i) => (
                  <div key={img.id} style={{ width: 88, fontSize: 11, textAlign: "center" }}>
                    <div style={{ position: "relative" }}>
                      <img
                        src={img.dataUrl}
                        alt=""
                        style={{
                          width: 88,
                          height: 88,
                          objectFit: "cover",
                          borderRadius: 8,
                          border: i === 0 ? "2px solid var(--brand)" : "1px solid var(--border)",
                        }}
                      />
                      {i === 0 && (
                        <span className="badge success" style={{ position: "absolute", top: 2, left: 2, fontSize: 9 }}>
                          Principal
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", justifyContent: "center", gap: 2, marginTop: 2 }}>
                      <button type="button" className="secondary" style={{ padding: "2px 6px" }} onClick={() => moverImagen(i, -1)}>
                        ◀
                      </button>
                      {i !== 0 && (
                        <button type="button" className="secondary" style={{ padding: "2px 6px" }} onClick={() => hacerPrincipal(i)}>
                          ★
                        </button>
                      )}
                      <button type="button" className="secondary" style={{ padding: "2px 6px" }} onClick={() => moverImagen(i, 1)}>
                        ▶
                      </button>
                      <button type="button" className="secondary" style={{ padding: "2px 6px" }} onClick={() => quitarImagen(img.id)}>
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ---- Variantes ---- */}
          <div>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)" }}>Variantes (opcional)</span>
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              {GRUPOS_SUGERIDOS.map((g) => (
                <button key={g} type="button" className="secondary" onClick={() => agregarGrupo(g)}>
                  + {g}
                </button>
              ))}
              <button type="button" className="secondary" onClick={() => agregarGrupo("Variante")}>
                + Personalizada
              </button>
            </div>

            {grupos.map((grupo) => (
              <div key={grupo.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, marginTop: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    value={grupo.nombre}
                    onChange={(e) => renombrarGrupo(grupo.id, e.target.value)}
                    style={{ maxWidth: 160, fontWeight: 600 }}
                  />
                  <input
                    placeholder="Escribe valores separados por coma y Enter (ej. Negro, Blanco)"
                    style={{ flex: 1 }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        agregarValores(grupo.id, (e.target as HTMLInputElement).value);
                        (e.target as HTMLInputElement).value = "";
                      }
                    }}
                    onBlur={(e) => {
                      agregarValores(grupo.id, e.target.value);
                      e.target.value = "";
                    }}
                  />
                  <button type="button" className="secondary" onClick={() => eliminarGrupo(grupo.id)}>
                    Quitar
                  </button>
                </div>
                {grupo.valores.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {grupo.valores.map((v) => (
                      <span
                        key={v}
                        className="badge"
                        style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                      >
                        {v}
                        <button
                          type="button"
                          onClick={() => quitarValor(grupo.id, v)}
                          style={{ border: "none", background: "none", cursor: "pointer", padding: 0, color: "inherit" }}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {combinaciones.length > 0 && (
              <div style={{ marginTop: 10, overflowX: "auto" }}>
                <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "4px 0" }}>
                  Se crearan <strong>{combinaciones.length}</strong> variantes. Ajusta cada una si lo necesitas.
                </p>
                <table style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Variante</th>
                      <th>SKU</th>
                      <th>Codigo</th>
                      <th>Precio</th>
                      <th>Stock</th>
                      <th>Imagen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {combinaciones.map((valores) => {
                      const titulo = valores.join(" / ");
                      const ov = overrides[titulo] ?? {};
                      return (
                        <tr key={titulo}>
                          <td style={{ whiteSpace: "nowrap" }}>{titulo}</td>
                          <td>
                            <input
                              style={{ width: 130 }}
                              value={ov.sku ?? skuVariante(valores)}
                              onChange={(e) => setOverride(titulo, "sku", e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              style={{ width: 130 }}
                              value={ov.codigoBarras ?? autoBarras[titulo] ?? ""}
                              onChange={(e) => setOverride(titulo, "codigoBarras", e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              placeholder={precio || "0"}
                              style={{ width: 90 }}
                              value={ov.precio ?? ""}
                              onChange={(e) => setOverride(titulo, "precio", e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              style={{ width: 70 }}
                              value={ov.stock ?? ""}
                              onChange={(e) => setOverride(titulo, "stock", e.target.value)}
                            />
                          </td>
                          <td>
                            <select
                              style={{ width: 110 }}
                              value={ov.imagenId ?? ""}
                              onChange={(e) => setOverride(titulo, "imagenId", e.target.value || undefined)}
                            >
                              <option value="">Principal</option>
                              {imagenes.map((img, idx) => (
                                <option key={img.id} value={img.id}>
                                  Imagen {idx + 1}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ---- Stock y disponibilidad ---- */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label>
              Sucursal donde entra el stock inicial
              <select value={sucursalStockId} onChange={(e) => setSucursalStockId(e.target.value)}>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </label>
            {combinaciones.length === 0 && (
              <label>
                Stock inicial
                <input type="number" value={stockInicial} onChange={(e) => setStockInicial(e.target.value)} />
              </label>
            )}
          </div>

          <div>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)" }}>Sucursales donde se vende</span>
            <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 13 }}>
              <label style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <input type="radio" checked={modoSucursales === "todas"} onChange={() => setModoSucursales("todas")} style={{ width: "auto" }} />
                Todas
              </label>
              <label style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <input type="radio" checked={modoSucursales === "algunas"} onChange={() => setModoSucursales("algunas")} style={{ width: "auto" }} />
                Solo algunas
              </label>
            </div>
            {modoSucursales === "algunas" && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
                {sucursales.map((s) => (
                  <label key={s.id} style={{ flexDirection: "row", alignItems: "center", gap: 4, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={sucursalIds.includes(s.id)}
                      onChange={() => alternarSucursal(s.id)}
                      style={{ width: "auto" }}
                    />
                    {s.nombre}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* ---- Shopify ---- */}
          {shopifyConectado && (
            <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={publicarShopify}
                onChange={(e) => setPublicarShopify(e.target.checked)}
                style={{ width: "auto" }}
              />
              Publicar en Shopify (si lo desmarcas, se crea como <strong style={{ margin: "0 4px" }}>borrador</strong> y no
              aparece en la tienda online)
            </label>
          )}

          {error && <span className="error-text">{error}</span>}
          {avisoSync && (
            <span className="badge warning" style={{ whiteSpace: "normal", lineHeight: 1.4 }}>
              {avisoSync}
            </span>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            {creado ? (
              <button type="button" onClick={onClose}>
                Cerrar
              </button>
            ) : (
              <>
                <button type="submit" disabled={guardando}>
                  {guardando ? "Guardando..." : combinaciones.length > 0 ? `Crear ${combinaciones.length} variantes` : "Crear producto"}
                </button>
                <button className="secondary" type="button" onClick={onClose}>
                  Cancelar
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
