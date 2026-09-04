// Convierte cualquier error de axios en un texto seguro para mostrar.
//
// Blindaje importante: si el servidor devolviera un objeto en vez de un
// string (por ejemplo un backend viejo que aun manda el error crudo de
// validacion), pintarlo directo en JSX rompe React y deja la pantalla en
// blanco. Aqui garantizamos que SIEMPRE salga un string.
export function mensajeError(err: unknown, respaldo = "Ocurrio un error inesperado"): string {
  const data = (err as any)?.response?.data?.error;

  if (typeof data === "string" && data.trim()) return data;

  // Formato antiguo de Zod: { fieldErrors: { campo: ["mensaje"] }, formErrors: [] }
  if (data && typeof data === "object") {
    const fieldErrors = (data as any).fieldErrors;
    if (fieldErrors && typeof fieldErrors === "object") {
      const primero = Object.entries(fieldErrors)
        .map(([campo, msgs]) => (Array.isArray(msgs) && msgs.length ? `${campo}: ${msgs[0]}` : null))
        .find(Boolean);
      if (primero) return primero;
    }
    const formErrors = (data as any).formErrors;
    if (Array.isArray(formErrors) && formErrors.length) return String(formErrors[0]);
    return respaldo;
  }

  const status = (err as any)?.response?.status;
  if (status === 404) {
    return "Esta funcion no existe todavia en el servidor. Actualiza el servidor a la ultima version.";
  }
  if (status === 401) return "Tu sesion expiro. Vuelve a iniciar sesion.";
  if (status === 403) return "No tienes permiso para realizar esta accion.";

  const mensaje = (err as any)?.message;
  if (typeof mensaje === "string" && mensaje.includes("Network Error")) {
    return "No hay conexion con el servidor. Revisa que este encendido.";
  }

  return respaldo;
}
