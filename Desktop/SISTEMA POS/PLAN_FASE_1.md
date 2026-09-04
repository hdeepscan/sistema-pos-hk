# Sistema POS multi-sucursal comercializable — Plan Fase 1

## Contexto

El usuario quiere construir un sistema POS de escritorio para Windows, distribuido como
instalador `.exe`, que se pueda **comercializar** a múltiples negocios (multi-tenant, estilo
Treinta). Cada negocio puede tener varias sucursales físicas y también un canal ecommerce
(Shopify), y necesita ver el inventario consolidado entre sucursales. Incluye venta con
lector de código de barras, impresión de recibos en impresora térmica, y en fases futuras:
gastos, clientes, proveedores, cobros de cartera, estadísticas y sincronización con Shopify.

Decisiones ya confirmadas con el usuario:
- **Modelo**: multi-tenant comercial (cada empresa registrada tiene sus datos aislados).
- **Backend**: nube propia (Postgres + API), sincronización de inventario entre sucursales
  en tiempo real vía internet (no solo local).
- **Stack**: Electron + React + Node.js/TypeScript de punta a punta.
- **Factura**: comprobante de venta imprimible simple (sin validez fiscal DIAN) para v1.
  Factura electrónica DIAN queda como fase futura aparte (requiere proveedor autorizado).
- **Alcance de esta fase**: solo Fase 1 — POS + inventario multi-sucursal + impresión de
  recibos + hardware (scanner/impresora) + empaquetado como instalador `.exe`. Clientes,
  proveedores, gastos, cobros, estadísticas avanzadas y Shopify quedan para fases
  posteriores (se deja el modelo de datos preparado para no tener que rehacer nada).

## Arquitectura general (monorepo)

```
sistema-pos/
  apps/
    backend/          # API Node.js (Fastify) + Prisma + PostgreSQL, multi-tenant
    desktop/           # Electron + React + TypeScript (empaquetado como .exe)
  packages/
    shared/             # Tipos TS y esquemas Zod compartidos entre backend y desktop
  package.json          # workspaces (npm/pnpm workspaces)
```

- **Backend**: Fastify + TypeScript + Prisma ORM sobre PostgreSQL. JWT para auth. Socket.io
  para push en tiempo real (inventario, ventas) entre sucursales de una misma empresa.
  Se despliega en un VPS/Railway/Render (fuera del alcance de código, pero el backend se
  deja listo con Dockerfile para desplegar donde el usuario decida).
- **Desktop**: Electron con proceso principal (Node, acceso a hardware: impresora ESC/POS,
  lectura de scanner) y renderer en React. SQLite local (`better-sqlite3`) como caché/cola
  offline: la sucursal sigue vendiendo si se cae internet y sincroniza al reconectar.
  WebSocket (socket.io-client) recibe actualizaciones de inventario de otras sucursales en
  tiempo real cuando hay conexión.
- **Empaquetado**: `electron-builder` con target `nsis` → genera un instalador `.exe` para
  Windows (doble clic, instala, crea acceso directo, incluye desinstalador).

## Modelo de datos (Fase 1, con campos previstos para fases futuras)

Prisma schema, multi-tenant vía `empresaId` en cada tabla:

- `Empresa` (tenant): nombre, plan, activo, fechaRegistro
- `Usuario`: empresaId, nombre, email, passwordHash, rol (ADMIN, GERENTE, CAJERO)
- `Sucursal`: empresaId, nombre, tipo (`FISICA` | `ECOMMERCE`), dirección
  - La sucursal `ECOMMERCE` representa el stock que luego (Fase Shopify) se sincronizará;
    en Fase 1 se maneja igual que una sucursal física para no bloquear el modelo.
- `Producto`: empresaId, sku, nombre, categoría, precio, costo, codigoBarras, activo
- `InventarioSucursal`: productoId, sucursalId, cantidad (stock por ubicación)
- `MovimientoInventario`: productoId, sucursalId, tipo (ENTRADA/SALIDA/TRASLADO), cantidad,
  motivo, usuarioId, fecha, sucursalDestinoId (para traslados entre sucursales)
- `Venta`: empresaId, sucursalId, usuarioId, fecha, total, metodoPago, consecutivo
- `VentaItem`: ventaId, productoId, cantidad, precioUnitario
- Campos/tablas reservados vacíos para fases futuras (no se implementa lógica aún, solo se
  documentan aquí, no se crean tablas prematuras): Cliente, Proveedor, Gasto, CuentaPorCobrar,
  ShopifyConfig — **se agregarán en su fase correspondiente**, no en Fase 1, para no
  sobre-construir.

## Backend — endpoints Fase 1

- Auth: `POST /auth/registro-empresa` (crea empresa + usuario admin), `POST /auth/login`
- Sucursales: CRUD básico
- Productos: CRUD + búsqueda por código de barras/SKU
- Inventario: consulta consolidada por producto (todas las sucursales) y por sucursal,
  registrar movimientos (entrada/salida/traslado)
- Ventas: crear venta (descuenta inventario de la sucursal), listar ventas por sucursal/fecha
- WebSocket namespace por `empresaId`: emite eventos `inventario:actualizado` y
  `venta:creada` a todas las sucursales conectadas de esa empresa

Autenticación: JWT de corta duración + refresh token. Middleware valida `empresaId` del
usuario en cada request para aislar datos entre tenants.

## Desktop — pantallas y hardware Fase 1

Pantallas: Login/Registro de empresa → Selección de sucursal → Dashboard → **Punto de
Venta** (POS) → Inventario (vista por sucursal + vista consolidada) → Configuración
(impresora, usuarios, sucursales).

- **Lector de código de barras**: la mayoría son USB-HID (actúan como teclado). Se captura
  en un input de la pantalla POS con detección por velocidad de tecleo + Enter final (sin
  necesitar SDK propietario). Se documenta que scanners Bluetooth/HID estándar funcionan así.
- **Impresora de recibos**: ESC/POS vía USB, usando librería `node-thermal-printer` desde el
  proceso principal de Electron (acceso a hardware). Genera el comprobante de venta con
  logo, ítems, totales, consecutivo — sin validez fiscal DIAN (v1).
- **Cola offline**: ventas y movimientos se escriben primero en SQLite local; un
  sincronizador en background los envía al backend cuando hay conexión y resuelve
  duplicados por UUID generado en cliente.

## Empaquetado

`electron-builder.yml` con `target: nsis`, ícono, nombre del producto, generación de
instalador único (`Sistema-POS-Setup-x.x.x.exe`) para distribución/venta. Auto-update y
firma de código quedan documentados como pendientes para una fase de distribución posterior
(requieren certificado de firma de código, fuera del alcance de este entorno).

## Verificación

- Backend: pruebas de los endpoints con requests reales (registro de empresa, login, crear
  producto, registrar venta, consultar inventario consolidado entre 2 sucursales).
- Desktop: `npm run dev` levanta Electron en modo desarrollo contra el backend local;
  flujo completo probado a mano: crear 2 sucursales, crear producto con stock en ambas,
  vender en una sucursal y verificar que la otra ve el inventario actualizado en tiempo
  real (websocket), imprimir recibo (o vista previa si no hay impresora física conectada
  en la máquina de desarrollo).
- Empaquetado: generar el `.exe` con `electron-builder` y confirmar que instala y abre en
  Windows.

## Fases futuras (no incluidas ahora, solo referencia)

2. Integración Shopify (OAuth client_credentials, refresco de token cada 24h, sync de
   productos/inventario, webhooks de órdenes).
3. Clientes, proveedores, gastos, cobros de cartera (siguiendo el modelo de Treinta).
4. Estadísticas/reportes avanzados.
5. Facturación electrónica DIAN (vía proveedor autorizado) y cobro de licencias
   (pasarela de pago para suscripciones).
