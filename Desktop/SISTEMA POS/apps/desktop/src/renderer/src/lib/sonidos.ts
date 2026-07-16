// Efectos de sonido sintetizados con Web Audio API (sin archivos de audio):
// cada evento es una secuencia corta de tonos. Respeta el volumen y el
// activar/desactivar guardados en la configuracion de la app.

export type Sonido =
  | "venta"
  | "error"
  | "advertencia"
  | "producto_agregado"
  | "producto_eliminado"
  | "credito_vencido"
  | "pedido_shopify"
  | "cliente_registrado"
  | "inventario_bajo";

let ctx: AudioContext | null = null;

function contexto(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function nota(inicio: number, frecuencia: number, duracion: number, volumen: number, tipo: OscillatorType = "sine") {
  const c = contexto();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = tipo;
  osc.frequency.value = frecuencia;
  const t0 = c.currentTime + inicio;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volumen, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duracion);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duracion + 0.02);
}

const SECUENCIAS: Record<Sonido, (v: number) => void> = {
  venta: (v) => {
    nota(0, 880, 0.12, v);
    nota(0.1, 1318, 0.2, v);
  },
  error: (v) => {
    nota(0, 300, 0.18, v, "sawtooth");
    nota(0.15, 220, 0.22, v, "sawtooth");
  },
  advertencia: (v) => {
    nota(0, 660, 0.16, v, "triangle");
  },
  producto_agregado: (v) => {
    nota(0, 1046, 0.07, v * 0.8);
  },
  producto_eliminado: (v) => {
    nota(0, 392, 0.08, v * 0.8);
  },
  credito_vencido: (v) => {
    nota(0, 300, 0.15, v, "triangle");
    nota(0.2, 300, 0.15, v, "triangle");
  },
  pedido_shopify: (v) => {
    nota(0, 784, 0.1, v);
    nota(0.1, 988, 0.1, v);
    nota(0.2, 1318, 0.22, v);
  },
  cliente_registrado: (v) => {
    nota(0, 659, 0.1, v);
    nota(0.12, 880, 0.16, v);
  },
  inventario_bajo: (v) => {
    nota(0, 500, 0.12, v, "triangle");
    nota(0.18, 500, 0.12, v, "triangle");
  },
};

export async function reproducir(sonido: Sonido) {
  try {
    const config = await window.pos.getConfig();
    if (!config.sonidoActivado) return;
    SECUENCIAS[sonido](Math.max(0, Math.min(1, config.sonidoVolumen)) * 0.3);
  } catch {
    // Si falla el audio (o no hay config aun) simplemente no suena.
  }
}
