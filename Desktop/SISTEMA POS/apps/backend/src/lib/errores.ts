import type { ZodError } from "zod";

// Nombre legible de cada campo + su genero, para que los mensajes concuerden
// ("el correo" / "la contraseña"). Clave = nombre tecnico del campo en el schema.
const CAMPOS: Record<string, { texto: string; genero: "m" | "f" }> = {
  email: { texto: "correo electronico", genero: "m" },
  adminEmail: { texto: "correo electronico", genero: "m" },
  nombre: { texto: "nombre", genero: "m" },
  adminNombre: { texto: "nombre del administrador", genero: "m" },
  empresaNombre: { texto: "nombre de la empresa", genero: "m" },
  password: { texto: "contraseña", genero: "f" },
  adminPassword: { texto: "contraseña", genero: "f" },
  telefono: { texto: "telefono", genero: "m" },
  cedula: { texto: "cedula", genero: "f" },
  ciudad: { texto: "ciudad", genero: "f" },
  direccion: { texto: "direccion", genero: "f" },
  sku: { texto: "SKU", genero: "m" },
  precio: { texto: "precio", genero: "m" },
  costo: { texto: "costo", genero: "m" },
  cantidad: { texto: "cantidad", genero: "f" },
  monto: { texto: "monto", genero: "m" },
  montoInicial: { texto: "monto inicial", genero: "m" },
  montoContado: { texto: "monto contado", genero: "m" },
  codigoBarras: { texto: "codigo de barras", genero: "m" },
  categoria: { texto: "categoria", genero: "f" },
  metodoPago: { texto: "metodo de pago", genero: "m" },
  dineroRecibido: { texto: "dinero recibido", genero: "m" },
  contactoCliente: { texto: "datos del cliente", genero: "m" },
  descuento: { texto: "descuento", genero: "m" },
  puntosARedimir: { texto: "puntos a redimir", genero: "m" },
  valor: { texto: "valor", genero: "m" },
  rol: { texto: "rol", genero: "m" },
  diasVencimientoCredito: { texto: "dias de vencimiento", genero: "m" },
  pesosPorPunto: { texto: "pesos por punto", genero: "m" },
  valorPunto: { texto: "valor del punto", genero: "m" },
  shopDomain: { texto: "dominio de la tienda", genero: "m" },
  clientId: { texto: "Client ID", genero: "m" },
  clientSecret: { texto: "Client Secret", genero: "m" },
  accessToken: { texto: "token de acceso", genero: "m" },
  adAccountId: { texto: "ID de cuenta publicitaria", genero: "m" },
  titulo: { texto: "titulo", genero: "m" },
  motivo: { texto: "motivo", genero: "m" },
  items: { texto: "productos", genero: "m" },
};

function campoDe(ruta: (string | number)[]): { texto: string; genero: "m" | "f" } {
  const nombre = ruta.filter((p) => typeof p === "string").pop() as string | undefined;
  if (!nombre) return { texto: "dato", genero: "m" };
  return CAMPOS[nombre] ?? { texto: nombre, genero: "m" };
}

// Convierte un error de Zod en UN mensaje corto y legible en español.
//
// Importante: nunca devolver el objeto crudo de Zod al cliente. La app de
// escritorio muestra este campo directamente en pantalla, y un objeto ahi
// rompe el renderizado (pantalla en blanco) ademas de no decirle nada util
// al usuario.
export function mensajeDeValidacion(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Hay datos invalidos en el formulario";

  const { texto, genero } = campoDe(issue.path);
  const el = genero === "f" ? "La" : "El";
  const del = genero === "f" ? "la" : "el";
  const msg = issue.message;

  if (/invalid email/i.test(msg)) return `${el} ${texto} no es valido`;
  if (/required/i.test(msg)) return `Falta ${del} ${texto}`;
  if (/expected number/i.test(msg)) return `${el} ${texto} debe ser un numero`;
  if (/greater than 0|positive/i.test(msg)) return `${el} ${texto} debe ser mayor a 0`;
  if (/at least \d+ character/i.test(msg)) return `${el} ${texto} es demasiado corto`;
  if (/at least \d+ element/i.test(msg)) return `Debes agregar al menos un item en ${texto}`;
  if (/invalid uuid/i.test(msg)) return "Identificador invalido";
  if (/invalid enum|invalid option/i.test(msg)) return `${el} ${texto} tiene un valor no permitido`;

  return `Revisa ${del} ${texto}`;
}
