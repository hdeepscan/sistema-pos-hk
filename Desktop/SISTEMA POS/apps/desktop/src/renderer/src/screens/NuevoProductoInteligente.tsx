import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useSesionStore } from "../lib/store";
import { leerArchivoComoDataUrl } from "../lib/files";
import { mensajeError } from "../lib/errores";
import { FILTRO_TODAS, coincideFiltroLote, opcionesFiltroLote } from "../lib/variantes-lote";

interface Proveedor {
  id: string;
  nombre: string;
}

interface Coleccion {
  id: string;
  titulo: string;
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
  const [colecciones, setColecciones] = useState<Coleccion[]>([]);
  const [coleccionesSeleccionadas, setColeccionesSeleccionadas] = useState<string[]>([]);

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

  // Llenado en lote de la tabla de variantes
  const [loteStock, setLoteStock] = useState("");
  const [lotePrecio, setLotePrecio] = useState("");
  const [loteFiltro, setLoteFiltro] = useState(FILTRO_TODAS);
  const [loteMensaje, setLoteMensaje] = useState<string | null>(null);

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
    api.get<Coleccion[]>("/colecciones").then(({ data }) => setColecciones(data)).catch(() => setColecciones([]));
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

  // Pone el mismo stock y/o precio a todas las variantes (o a las de una talla, color...).
  function aplicarLote() {
    const stock = loteStock.trim();
    const precioLote = lotePrecio.trim();
    if (!stock && !precioLote) {
      setLoteMensaje("Escribe un stock o un precio para aplicar");
      return;
    }
    const destino = combinaciones.filter((valores) => coincideFiltroLote(valores, loteFiltro));
    setOverrides((prev) => {
      const sig = { ...prev };
      for (const valores of destino) {
        const titulo = valores.join(" / ");
        sig[titulo] = {
          ...sig[titulo],
          ...(stock ? { stock: String(Math.max(0, Math.floor(Number(stock) || 0))) } : {}),
          ...(precioLote ? { precio: precioLote } : {}),
        };
      }
      return sig;
    });
    setLoteMensaje(`Aplicado a ${destino.length} variante${destino.length === 1 ? "" : "s"}`);
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

      // Asociar colecciones seleccionadas al producto recién creado
      if (coleccionesSeleccionadas.length > 0 && data?.id) {
        for (const coleccionId of coleccionesSeleccionadas) {
          try {
            await api.post(`/colecciones/${coleccionId}/productos`, {
              productoId: data.id,
            });
          } catch (err) {
            console.error(`Error asociando coleccion ${coleccionId}:`, err);
          }
        }
      }

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

  const margen =
    Number(precio) > 0 && costo !== "" ? Math.round(((Number(precio) - Number(costo || 0)) / Number(precio)) * 100) : null;

  return (
    // Clic fuera NO cierra: es un formulario largo y se perdería lo escrito.
    <div className="modal-backdrop np-backdrop">
      <form className="np-modal" onSubmit={guardar}>
        {/* ---- Encabezado fijo ---- */}
        <header className="np-header">
          <div>
            <h3>Nuevo producto</h3>
            <p>Completa los datos por secciones. Los campos con * son obligatorios.</p>
          </div>
          <button type="button" className="np-cerrar" aria-label="Cerrar" onClick={onClose} disabled={guardando}>
            ✕
          </button>
        </header>

        <div className="np-body">
          {/* ---- Información básica ---- */}
          <section className="np-section">
            <div className="np-section-title">
              <span className="np-step">1</span>
              <div>
                <h4>Información básica</h4>
                <p>Cómo se llama y cómo lo encuentras en el catálogo.</p>
              </div>
            </div>
            <div className="np-grid">
              <div className="np-field np-full">
                <span className="np-label">Nombre *</span>
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Conjunto dama deportivo" required autoFocus />
              </div>
              <div className="np-field">
                <span className="np-label">Categoría</span>
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
              </div>
              <div className="np-field">
                <span className="np-label">Marca</span>
                <input value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Opcional" />
              </div>
              <div className="np-field">
                <span className="np-label">Proveedor</span>
                <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
                  <option value="">Sin proveedor</option>
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="np-field np-full">
                <span className="np-label">Descripción</span>
                <textarea
                  rows={3}
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Detalles del producto: material, cuidados, medidas..."
                />
              </div>
            </div>
          </section>

          {/* ---- Precios ---- */}
          <section className="np-section">
            <div className="np-section-title">
              <span className="np-step">2</span>
              <div>
                <h4>Precios</h4>
                <p>El precio de venta se usa en el POS y en Shopify.</p>
              </div>
            </div>
            <div className="np-grid np-grid-3">
              <div className="np-field">
                <span className="np-label">Precio de compra (costo)</span>
                <div className="np-input-prefijo">
                  <span>$</span>
                  <input type="number" min="0" step="0.01" value={costo} onChange={(e) => setCosto(e.target.value)} />
                </div>
              </div>
              <div className="np-field">
                <span className="np-label">Precio de venta *</span>
                <div className="np-input-prefijo">
                  <span>$</span>
                  <input type="number" min="0" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="0" required />
                </div>
                {margen !== null && (
                  <span className={`np-hint ${margen < 0 ? "np-hint-danger" : ""}`}>
                    Margen: {margen}% {margen < 0 ? "(estás vendiendo por debajo del costo)" : ""}
                  </span>
                )}
              </div>
              <div className="np-field">
                <span className="np-label">Impuesto (%)</span>
                <input type="number" min="0" max="100" step="0.01" value={impuesto} onChange={(e) => setImpuesto(e.target.value)} />
              </div>
            </div>
          </section>

          {/* ---- Códigos ---- */}
          <section className="np-section">
            <div className="np-section-title">
              <span className="np-step">3</span>
              <div>
                <h4>Códigos</h4>
                <p>Se generan solos a partir del nombre; puedes cambiarlos.</p>
              </div>
            </div>
            <div className="np-grid">
              <div className="np-field">
                <span className="np-label">SKU *</span>
                <input
                  value={sku}
                  onChange={(e) => {
                    setSkuManual(true);
                    setSku(e.target.value);
                  }}
                  required
                />
                <span className="np-hint">Código interno para identificar el producto.</span>
              </div>
              <div className="np-field">
                <span className="np-label">Código de barras</span>
                <div className="np-input-accion">
                  <input
                    value={codigoBarras}
                    onChange={(e) => {
                      setCodigoManual(true);
                      setCodigoBarras(e.target.value);
                    }}
                    placeholder="Escanéalo o genera uno"
                  />
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setCodigoManual(true);
                      setCodigoBarras(generarCodigoBarras());
                    }}
                  >
                    Generar
                  </button>
                </div>
                <span className="np-hint">Si el producto ya trae código, escanéalo aquí.</span>
              </div>
            </div>
          </section>

          {/* ---- Imágenes ---- */}
          <section className="np-section">
            <div className="np-section-title">
              <span className="np-step">4</span>
              <div>
                <h4>Imágenes</h4>
                <p>La primera es la principal. Usa ◀ ▶ para ordenarlas.</p>
              </div>
            </div>
            <label
              className="np-dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files.length) agregarArchivos(e.dataTransfer.files);
              }}
            >
              <span className="np-dropzone-icono">🖼️</span>
              <span>
                Arrastra imágenes aquí o <strong>selecciónalas</strong>
              </span>
              <input
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={(e) => e.target.files && agregarArchivos(e.target.files)}
              />
            </label>
            {imagenes.length > 0 && (
              <div className="np-imagenes">
                {imagenes.map((img, i) => (
                  <div key={img.id} className={`np-imagen ${i === 0 ? "np-imagen-principal" : ""}`}>
                    <img src={img.dataUrl} alt="" />
                    {i === 0 && <span className="np-imagen-tag">Principal</span>}
                    <div className="np-imagen-acciones">
                      <button type="button" title="Mover a la izquierda" onClick={() => moverImagen(i, -1)}>
                        ◀
                      </button>
                      {i !== 0 && (
                        <button type="button" title="Hacer principal" onClick={() => hacerPrincipal(i)}>
                          ★
                        </button>
                      )}
                      <button type="button" title="Mover a la derecha" onClick={() => moverImagen(i, 1)}>
                        ▶
                      </button>
                      <button type="button" title="Quitar" onClick={() => quitarImagen(img.id)}>
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ---- Variantes ---- */}
          <section className="np-section">
            <div className="np-section-title">
              <span className="np-step">5</span>
              <div>
                <h4>Variantes (opcional)</h4>
                <p>Si el producto viene en tallas, colores, etc., se crea una variante por cada combinación.</p>
              </div>
            </div>
            <div className="np-chips-acciones">
              {GRUPOS_SUGERIDOS.map((g) => (
                <button key={g} type="button" className="secondary" onClick={() => agregarGrupo(g)} disabled={grupos.some((x) => x.nombre.toLowerCase() === g.toLowerCase())}>
                  + {g}
                </button>
              ))}
              <button type="button" className="secondary" onClick={() => agregarGrupo("Variante")}>
                + Personalizada
              </button>
            </div>

            {grupos.map((grupo) => (
              <div key={grupo.id} className="np-grupo">
                <div className="np-grupo-fila">
                  <input
                    className="np-grupo-nombre"
                    value={grupo.nombre}
                    onChange={(e) => renombrarGrupo(grupo.id, e.target.value)}
                    aria-label="Nombre del grupo"
                  />
                  <input
                    placeholder="Escribe valores separados por coma y presiona Enter (ej. S, M, L)"
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
                {grupo.valores.length > 0 ? (
                  <div className="np-chips">
                    {grupo.valores.map((v) => (
                      <span key={v} className="np-chip">
                        {v}
                        <button type="button" aria-label={`Quitar ${v}`} onClick={() => quitarValor(grupo.id, v)}>
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="np-hint">Aún no hay valores para {grupo.nombre || "este grupo"}.</span>
                )}
              </div>
            ))}

            {combinaciones.length > 0 && (
              <div className="np-variantes">
                <p className="np-hint">
                  Se crearán <strong>{combinaciones.length}</strong> variantes. Deja el precio vacío para usar el precio de venta general.
                </p>
                <div className="lote-barra">
                  <span className="lote-titulo">Llenar en lote</span>
                  <div className="lote-campo">
                    <span>Stock</span>
                    <input type="number" min="0" placeholder="Ej: 10" value={loteStock} onChange={(e) => setLoteStock(e.target.value)} />
                  </div>
                  <div className="lote-campo">
                    <span>Precio</span>
                    <input type="number" min="0" step="0.01" placeholder="Opcional" value={lotePrecio} onChange={(e) => setLotePrecio(e.target.value)} />
                  </div>
                  <div className="lote-campo lote-campo-ancho">
                    <span>Aplicar a</span>
                    <select value={loteFiltro} onChange={(e) => setLoteFiltro(e.target.value)}>
                      {opcionesFiltroLote(
                        combinaciones,
                        grupos.filter((g) => g.valores.length > 0).map((g) => g.nombre)
                      ).map((o) => (
                        <option key={o.valor} value={o.valor}>
                          {o.etiqueta}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button type="button" onClick={aplicarLote}>
                    Aplicar
                  </button>
                  {loteMensaje && <span className="lote-mensaje">{loteMensaje}</span>}
                </div>
                <div className="np-tabla-scroll">
                  <table className="np-tabla">
                    <thead>
                      <tr>
                        <th>Variante</th>
                        <th>SKU</th>
                        <th>Código de barras</th>
                        <th>Precio</th>
                        <th>Stock inicial</th>
                        <th>Imagen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {combinaciones.map((valores) => {
                        const titulo = valores.join(" / ");
                        const ov = overrides[titulo] ?? {};
                        return (
                          <tr key={titulo}>
                            <td className="np-variante-titulo">{titulo}</td>
                            <td>
                              <input value={ov.sku ?? skuVariante(valores)} onChange={(e) => setOverride(titulo, "sku", e.target.value)} />
                            </td>
                            <td>
                              <input
                                value={ov.codigoBarras ?? autoBarras[titulo] ?? ""}
                                onChange={(e) => setOverride(titulo, "codigoBarras", e.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder={precio || "0"}
                                value={ov.precio ?? ""}
                                onChange={(e) => setOverride(titulo, "precio", e.target.value)}
                              />
                            </td>
                            <td>
                              <input type="number" min="0" placeholder="0" value={ov.stock ?? ""} onChange={(e) => setOverride(titulo, "stock", e.target.value)} />
                            </td>
                            <td>
                              <select value={ov.imagenId ?? ""} onChange={(e) => setOverride(titulo, "imagenId", e.target.value || undefined)}>
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
              </div>
            )}
          </section>

          {/* ---- Inventario y disponibilidad ---- */}
          <section className="np-section">
            <div className="np-section-title">
              <span className="np-step">6</span>
              <div>
                <h4>Inventario y disponibilidad</h4>
                <p>Dónde entra el stock inicial y en qué sucursales se puede vender.</p>
              </div>
            </div>
            <div className="np-grid">
              <div className="np-field">
                <span className="np-label">Sucursal del stock inicial</span>
                <select value={sucursalStockId} onChange={(e) => setSucursalStockId(e.target.value)}>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </div>
              {combinaciones.length === 0 ? (
                <div className="np-field">
                  <span className="np-label">Stock inicial</span>
                  <input type="number" min="0" value={stockInicial} onChange={(e) => setStockInicial(e.target.value)} />
                </div>
              ) : (
                <div className="np-field">
                  <span className="np-label">Stock inicial</span>
                  <span className="np-hint">Se indica por variante en la tabla de arriba.</span>
                </div>
              )}
              <div className="np-field np-full">
                <span className="np-label">Sucursales donde se vende</span>
                <div className="np-segmentado">
                  <button type="button" className={modoSucursales === "todas" ? "activo" : ""} onClick={() => setModoSucursales("todas")}>
                    Todas
                  </button>
                  <button type="button" className={modoSucursales === "algunas" ? "activo" : ""} onClick={() => setModoSucursales("algunas")}>
                    Solo algunas
                  </button>
                </div>
                {modoSucursales === "algunas" && (
                  <div className="np-chips">
                    {sucursales.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`np-chip-toggle ${sucursalIds.includes(s.id) ? "activo" : ""}`}
                        onClick={() => alternarSucursal(s.id)}
                      >
                        {sucursalIds.includes(s.id) ? "✓ " : ""}
                        {s.nombre}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ---- Organización y publicación ---- */}
          <section className="np-section">
            <div className="np-section-title">
              <span className="np-step">7</span>
              <div>
                <h4>Estado y publicación</h4>
                <p>Colecciones, si está activo y si se publica en Shopify.</p>
              </div>
            </div>
            {colecciones.length > 0 && (
              <div className="np-field">
                <span className="np-label">Colecciones</span>
                <div className="np-chips">
                  {colecciones.map((c) => {
                    const sel = coleccionesSeleccionadas.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`np-chip-toggle ${sel ? "activo" : ""}`}
                        onClick={() =>
                          setColeccionesSeleccionadas(sel ? coleccionesSeleccionadas.filter((id) => id !== c.id) : [...coleccionesSeleccionadas, c.id])
                        }
                      >
                        {sel ? "✓ " : ""}
                        {c.titulo}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <label className="np-switch">
              <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
              <span className="np-switch-pista" />
              <span>
                <strong>Producto activo</strong>
                <small>Si lo desactivas, no aparece en el punto de venta.</small>
              </span>
            </label>
            {shopifyConectado && (
              <label className="np-switch">
                <input type="checkbox" checked={publicarShopify} onChange={(e) => setPublicarShopify(e.target.checked)} />
                <span className="np-switch-pista" />
                <span>
                  <strong>Publicar en Shopify</strong>
                  <small>Si lo desmarcas, se crea como borrador y no aparece en la tienda online.</small>
                </span>
              </label>
            )}
          </section>
        </div>

        {/* ---- Pie fijo con acciones ---- */}
        <footer className="np-footer">
          <div className="np-footer-mensajes">
            {error && <span className="error-text">{error}</span>}
            {avisoSync && <span className="badge warning np-aviso">{avisoSync}</span>}
          </div>
          <div className="np-footer-botones">
            {creado ? (
              <button type="button" onClick={onClose}>
                Cerrar
              </button>
            ) : (
              <>
                <button className="secondary" type="button" onClick={onClose} disabled={guardando}>
                  Cancelar
                </button>
                <button type="submit" disabled={guardando}>
                  {guardando ? "Guardando..." : combinaciones.length > 0 ? `Crear ${combinaciones.length} variantes` : "Crear producto"}
                </button>
              </>
            )}
          </div>
        </footer>
      </form>
    </div>
  );
}
