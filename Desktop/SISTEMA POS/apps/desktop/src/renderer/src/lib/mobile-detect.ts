/**
 * Detectar si el usuario está en un dispositivo móvil.
 * Usa multiple métodos para máxima compatibilidad.
 */

export function isMobileDevice(): boolean {
  // Método 1: Ancho de ventana (breakpoint)
  if (typeof window !== "undefined" && window.innerWidth < 768) {
    return true;
  }

  // Método 2: User Agent (más agresivo)
  if (typeof navigator !== "undefined") {
    const ua = navigator.userAgent.toLowerCase();
    const mobilePatterns = [
      /android/,
      /webos/,
      /iphone/,
      /ipad/,
      /ipod/,
      /blackberry/,
      /windows phone/,
      /opera mini/,
      /mobile/,
      /tablet/,
    ];
    if (mobilePatterns.some((pattern) => pattern.test(ua))) {
      return true;
    }
  }

  // Método 3: Pantalla táctil (heurística)
  if (typeof navigator !== "undefined" && navigator.maxTouchPoints > 2) {
    return true;
  }

  return false;
}

/**
 * Obtener preferencia guardada del usuario (si forzó desktop/mobile)
 * Retorna: true (mobile), false (desktop), null (no hay preferencia)
 */
export function getMobilePreference(): boolean | null {
  if (typeof localStorage === "undefined") return null;
  const pref = localStorage.getItem("pos-mobile-override");
  if (pref === "true") return true;
  if (pref === "false") return false;
  return null;
}

/**
 * Guardar preferencia del usuario (forzar mobile/desktop)
 * pass null para limpiar la preferencia y volver a detección automática
 */
export function setMobilePreference(value: boolean | null): void {
  if (typeof localStorage === "undefined") return;
  if (value === null) {
    localStorage.removeItem("pos-mobile-override");
  } else {
    localStorage.setItem("pos-mobile-override", String(value));
  }
}
