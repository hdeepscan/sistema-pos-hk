/*
 * Service worker de CENTRALA (PWA).
 *
 * Reglas:
 * - Las rutas del API viven en la raíz (/auth, /productos, /ventas...), así que el SW NO toca
 *   nada que no sea: navegación a la app, /assets/* (archivos con hash de Vite), /icons/* y el manifest.
 *   Todo lo demás (API, socket.io, webhooks) pasa directo a la red, sin caché.
 * - La app (index.html) va primero a la red: cada deploy en Railway se ve de una.
 *   Solo si no hay internet se muestra la última versión guardada.
 * - /assets/* tienen hash en el nombre, así que se sirven desde caché sin miedo.
 */
const VERSION = "centrala-pwa-v1";
const CACHE_APP = `${VERSION}-app`;
const CACHE_ASSETS = `${VERSION}-assets`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_APP)
      .then((cache) => cache.addAll(["/", "/manifest.webmanifest", "/icons/icon-192.png"]))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const PAGINA_OFFLINE = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CENTRALA</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:Inter,system-ui,sans-serif;background:#F8FAFC;color:#0F172A;text-align:center;padding:24px}
.c{max-width:340px}img{width:72px;height:72px}h1{font-size:20px;margin:16px 0 8px}p{color:#64748B;font-size:14px;margin:0 0 20px}
button{background:#2563EB;color:#fff;border:0;border-radius:10px;padding:12px 22px;font-size:15px;font-weight:600}</style></head>
<body><div class="c"><img src="/icons/icon-192.png" alt=""><h1>Sin conexión</h1><p>CENTRALA necesita internet para cargar. Revisa tu conexión e intenta de nuevo.</p><button onclick="location.reload()">Reintentar</button></div></body></html>`;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 1. Navegación (abrir la app): red primero, caché como respaldo.
  if (req.mode === "navigate") {
    const esLaApp = url.pathname === "/" || url.pathname === "/index.html";
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (esLaApp && res.ok) {
            const copia = res.clone();
            caches.open(CACHE_APP).then((c) => c.put("/", copia)).catch(() => {});
          }
          return res;
        })
        .catch(async () => {
          const guardada = await caches.match("/");
          return guardada || new Response(PAGINA_OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } });
        })
    );
    return;
  }

  // 2. Archivos de Vite con hash: caché primero.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(req).then(
        (enCache) =>
          enCache ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copia = res.clone();
              caches.open(CACHE_ASSETS).then((c) => c.put(req, copia)).catch(() => {});
            }
            return res;
          })
      )
    );
    return;
  }

  // 3. Íconos y manifest: devolver lo guardado y refrescar en segundo plano.
  if (url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      caches.match(req).then((enCache) => {
        const red = fetch(req)
          .then((res) => {
            if (res.ok) {
              const copia = res.clone();
              caches.open(CACHE_APP).then((c) => c.put(req, copia)).catch(() => {});
            }
            return res;
          })
          .catch(() => enCache);
        return enCache || red;
      })
    );
  }
  // Todo lo demás (API, socket.io, webhooks): sin tocar.
});
