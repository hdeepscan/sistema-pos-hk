/**
 * PWA: registra el service worker y maneja el aviso de "Instalar app".
 * Solo aplica en la versión web (Railway). En Electron no hace nada.
 */
import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const esElectron = () => typeof window !== "undefined" && !!(window as any).pos;

let eventoInstalacion: BeforeInstallPromptEvent | null = null;
const suscriptores = new Set<() => void>();
const avisar = () => suscriptores.forEach((fn) => fn());

export function registrarPWA(): void {
  if (typeof window === "undefined" || esElectron()) return;
  if (!("serviceWorker" in navigator)) return;
  const seguro = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (!seguro) return;

  // Chrome / Android guardan el evento para mostrar nuestro propio botón de "Instalar".
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    eventoInstalacion = e as BeforeInstallPromptEvent;
    avisar();
  });
  window.addEventListener("appinstalled", () => {
    eventoInstalacion = null;
    avisar();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("[PWA] No se pudo registrar el SW:", err));
  });
}

/** true si la app ya está abierta como app instalada (pantalla completa). */
export function estaInstalada(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;
}

export function esIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ se identifica como Mac, pero con pantalla táctil.
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

/** Hook: indica si se puede mostrar el botón nativo de instalar (Android/Chrome) y lo dispara. */
export function useInstalarPWA() {
  const [, forzar] = useState(0);
  useEffect(() => {
    const fn = () => forzar((n) => n + 1);
    suscriptores.add(fn);
    return () => {
      suscriptores.delete(fn);
    };
  }, []);

  return {
    puedeInstalar: !!eventoInstalacion,
    instalar: async (): Promise<boolean> => {
      if (!eventoInstalacion) return false;
      await eventoInstalacion.prompt();
      const { outcome } = await eventoInstalacion.userChoice;
      eventoInstalacion = null;
      avisar();
      return outcome === "accepted";
    },
  };
}
