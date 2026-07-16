# SISTEMA POS HK

Sistema de punto de venta multi-sucursal, multi-tenant, con app de escritorio
para Windows (Electron), modulos de clientes/cobranza, proveedores/compras,
gastos, reportes, e integracion con Shopify. Ver el plan de la Fase 1 en
`PLAN_FASE_1.md`.

## Estructura

```
apps/backend    API en la nube (Fastify + Prisma + PostgreSQL + WebSocket)
apps/desktop    App de escritorio (Electron + React), se empaqueta como .exe
packages/shared Tipos y validaciones compartidas entre backend y desktop
```

## Requisitos

- Node.js 20+ (usado: v24)
- Una base de datos PostgreSQL. Para desarrollo rapido sin instalar nada:
  - [Neon](https://neon.tech) o [Supabase](https://supabase.com) (plan gratis, 2 minutos)
  - o Postgres local / Docker si lo prefieres

## Configurar el backend

1. `cd apps/backend`
2. Copia `.env.example` a `.env` y reemplaza `DATABASE_URL` con tu cadena de conexion real,
   y `JWT_SECRET` con una cadena aleatoria larga.
3. Desde la raiz del repo: `npm run backend:migrate` (crea las tablas en tu base de datos)
4. `npm run backend:dev` (queda escuchando en `http://localhost:4000`)

## Ejecutar la app de escritorio en modo desarrollo

1. Desde la raiz del repo: `npm run desktop:dev`
2. Se abre la ventana de Electron. En la pantalla de login, verifica que
   "URL del servidor" apunte a `http://localhost:4000` (o donde tengas el backend).
3. Usa "Registrar empresa" para crear tu primera empresa y usuario administrador.
   Esto crea automaticamente una sucursal "Principal".

## Flujo de prueba sugerido (multi-sucursal)

1. Registra una empresa (crea la sucursal "Principal").
2. En Configuracion, agrega una segunda sucursal.
3. En Inventario, crea un producto (SKU, nombre, precio, codigo de barras opcional).
4. Abre dos ventanas de la app (o dos instalaciones) con la misma cuenta, cada una
   con una sucursal activa distinta.
5. Registra una ENTRADA de inventario para ese producto en cada sucursal desde
   la pantalla de Inventario, o un TRASLADO entre sucursales.
6. Ve al Punto de Venta de una sucursal, escanea/escribe el codigo del producto
   (o buscalo por nombre) y cobra la venta. Verifica que la otra ventana refleje
   el nuevo stock consolidado en tiempo real (via WebSocket) sin recargar.
7. Si tienes una impresora instalada en Windows (fisica o virtual, ej. "Microsoft
   Print to PDF"), selecciona la impresora en Configuracion y confirma que al
   cobrar se imprime el comprobante de venta.

## Generar el instalador .exe

```
npm run dist -w apps/desktop
```

Genera `apps/desktop/release/Sistema-POS-Setup-<version>.exe`. El backend debe
estar desplegado en un servidor accesible por internet (Railway, Render, un VPS,
etc.) antes de distribuir el instalador a clientes reales; la URL del servidor
se configura desde la pantalla de login de la app (queda guardada localmente).

## Notas de diseno relevantes

- **Impresion de recibos**: se imprime como HTML renderizado usando el spool de
  impresion de Windows (`webContents.print`), no ESC/POS crudo. Esto evita
  depender de drivers/SDKs propietarios de cada marca de impresora: cualquier
  impresora (termica USB, de red, o incluso PDF) que aparezca como impresora de
  Windows funciona.
- **Cola offline**: las ventas se intentan enviar al backend de inmediato; si no
  hay conexion, se guardan en un archivo JSON local (`cola-sync.json` en la
  carpeta de datos de la app) y un proceso en segundo plano las reintenta cada
  15 segundos. El backend deduplica por `clienteUuid`, asi que reintentar una
  venta ya sincronizada no la duplica.
- **Multi-tenant**: cada empresa registrada (`Empresa`) tiene sus propios
  usuarios, sucursales, productos e inventario, aislados por `empresaId` en
  cada consulta.

## Fases futuras (no incluidas aun)

Integracion con Shopify, clientes, proveedores, gastos, cobranza de cartera,
estadisticas avanzadas y facturacion electronica DIAN. Ver `PLAN_FASE_1.md`.
