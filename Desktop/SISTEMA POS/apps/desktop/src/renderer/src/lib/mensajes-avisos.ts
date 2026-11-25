// Preferencias de avisos de la bandeja de mensajes (por navegador) y la conversación que se está
// viendo (para no avisar de un mensaje que la persona ya tiene en pantalla).

const CLAVE_SONIDO = "msj.sonido";
const CLAVE_NAVEGADOR = "msj.avisosNavegador";

function leer(clave: string, porDefecto: boolean): boolean {
  try {
    const v = localStorage.getItem(clave);
    return v === null ? porDefecto : v === "1";
  } catch {
    return porDefecto;
  }
}

function guardar(clave: string, valor: boolean) {
  try {
    localStorage.setItem(clave, valor ? "1" : "0");
  } catch {
    /* sin almacenamiento local */
  }
}

export const avisosMensajes = {
  conversacionAbierta: null as string | null,
  sonido: () => leer(CLAVE_SONIDO, true),
  setSonido: (v: boolean) => guardar(CLAVE_SONIDO, v),
  soportaNavegador: () => typeof window !== "undefined" && "Notification" in window,
  navegador: () => avisosMensajes.soportaNavegador() && Notification.permission === "granted" && leer(CLAVE_NAVEGADOR, true),
  setNavegador: (v: boolean) => guardar(CLAVE_NAVEGADOR, v),
  /** Pide permiso al navegador (tiene que ser al tocar un botón). Devuelve si quedó activo. */
  async activarNavegador(): Promise<boolean> {
    if (!avisosMensajes.soportaNavegador()) return false;
    const permiso = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    const ok = permiso === "granted";
    guardar(CLAVE_NAVEGADOR, ok);
    return ok;
  },
};

/** Sonido corto de "mensaje nuevo" (dos notas), sin archivos de audio. */
export function sonarMensaje() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const nota = (inicio: number, f: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + inicio);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + inicio + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + inicio + 0.25);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + inicio);
      o.stop(ctx.currentTime + inicio + 0.3);
    };
    nota(0, 880);
    nota(0.13, 1320);
    setTimeout(() => void ctx.close(), 800);
  } catch {
    /* el navegador no deja reproducir sonido todavía */
  }
}
