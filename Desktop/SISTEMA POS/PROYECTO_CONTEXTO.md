# 📊 SISTEMA POS HK - Contexto Completo del Proyecto

**Versión Actual:** 0.8.15 | **Última Actualización:** 2026-08-05

## 🎯 Descripción General

**Sistema POS HK** es un sistema completo de punto de venta multi-sucursal con las siguientes características:

- ✅ Punto de venta en tiempo real (Electron + React)
- ✅ Integración bidireccional con Shopify
- ✅ Sistema de créditos completo con cuotas y vencimientos
- ✅ Gestión de inventario con códigos de barras
- ✅ Fidelización y puntos de cliente
- ✅ Descuentos, devoluciones parciales y cupones
- ✅ Notificaciones y alertas de cobro
- ✅ Calendario de eventos (pagos, reposiciones, tareas)
- ✅ Análisis de ventas y reportes
- ✅ Impresoras térmicas (etiquetas, recibos)
- ✅ Sincronización offline con cola de eventos

---

## 🏗️ Arquitectura Técnica

### Frontend (Desktop + Web)
- **Framework:** React 18.3 con TypeScript
- **Plataforma Desktop:** Electron 32
- **Routing:** React Router 6
- **State Management:** Zustand
- **HTTP Client:** Axios
- **Librerías Especiales:**
  - `jsbarcode` - Generación de códigos de barras
  - `jspdf` + `jspdf-autotable` - Reportes PDF
  - `qrcode` - QR codes
  - `socket.io-client` - Sincronización en tiempo real

### Backend
- **Framework:** Fastify (Node.js)
- **ORM:** Prisma
- **Base de Datos:** PostgreSQL (Neon - Cloud)
- **Autenticación:** JWT
- **Validación:** Zod schemas

### Infraestructura
- **Deployment Backend:** Vercel (API serverless)
- **Base de Datos:** Neon PostgreSQL
- **Integración Shopify:** App OAuth
- **Aplicación Desktop:** Electron Builder

---

## 📁 Estructura de Carpetas

```
apps/
├── backend/
│   ├── src/
│   │   ├── routes/              # Endpoints por módulo
│   │   │   ├── ventas.ts        # CRUD de ventas + descuentos
│   │   │   ├── creditos.ts      # Créditos, cuotas, abonos
│   │   │   ├── clientes.ts      # Clientes y saldo pendiente
│   │   │   ├── shopify.ts       # Sincronización Shopify
│   │   │   ├── productos.ts     # Inventario y SKUs
│   │   │   └── ...
│   │   ├── lib/
│   │   │   ├── prisma.js        # Cliente Prisma
│   │   │   ├── shopify.js       # Lógica de sincronización
│   │   │   ├── errores.js       # Mensajes de error
│   │   │   └── auditoria.js     # Logging de cambios
│   │   ├── server.ts            # Configuración Fastify
│   │   └── index.ts             # Punto de entrada
│   └── prisma/
│       ├── schema.prisma        # Modelos de BD
│       └── migrations/          # Scripts de migración SQL
│
├── desktop/
│   └── src/
│       ├── main/
│       │   ├── index.ts         # Ventana principal Electron
│       │   ├── printer.ts       # Gestión de impresoras
│       │   └── ...
│       └── renderer/
│           ├── src/
│           │   ├── components/  # Componentes reutilizables
│           │   │   ├── ModalCredito.tsx          # Modal crear crédito
│           │   │   ├── DetalleCreditoModal.tsx   # Modal detalles crédito
│           │   │   └── ...
│           │   ├── screens/     # Pantallas principales
│           │   │   ├── Pos.tsx              # Punto de venta
│           │   │   ├── Ventas.tsx          # Historial de ventas
│           │   │   ├── Clientes.tsx        # Gestión de clientes
│           │   │   ├── Creditos.tsx        # Gestión de créditos
│           │   │   ├── Calendario.tsx      # Eventos y pagos
│           │   │   ├── Notificaciones.tsx  # Centro de alertas
│           │   │   ├── Inventario.tsx      # Stock y productos
│           │   │   ├── Reportes.tsx        # Análisis y reportes
│           │   │   └── ...
│           │   └── lib/
│           │       ├── api.ts             # Cliente HTTP con auth
│           │       ├── store.ts           # Zustand store global
│           │       └── ...
│           └── index.html
│
└── shared/
    └── src/index.ts            # Tipos TypeScript compartidos
```

---

## 🔄 Flujo de Datos - Sistema de Créditos

### 1. Crear Crédito en POS
```
POS.tsx (selecciona CREDITO)
  → ModalCredito (clienteId, cuotas, plazo, abonoInicial)
    → cobrar() en Pos.tsx
      → POST /ventas { metodoPago: "CREDITO", numeroCuotas, plazoMeses }
        → Backend crea Venta + calcula fechaVencimientoCredito
        → Si abonoInicial > 0: POST /creditos/:ventaId/abonar
```

### 2. Listar Créditos
```
Creditos.tsx
  → GET /creditos?estado={VIGENTE|PROXIMO_A_VENCER|VENCIDO}
    → calcularCreditos() en backend:
      - Busca todas las ventas con metodoPago="CREDITO"
      - Suma abonos por cliente (FIFO)
      - Calcula pendiente = total - abonos_aplicados
      - Calcula estado según fechaVencimiento
```

### 3. Ver Detalles y Abonar
```
Creditos.tsx (clickea "Ver info")
  → DetalleCreditoModal abre
    → GET /creditos/:ventaId/detalle
    → GET /creditos/:ventaId/proximos-pagos (calcula cuotas)
    → Usuario registra abono:
      → POST /creditos/:ventaId/abonar { monto }
        → Crea record en tabla Abono
```

### 4. Alertas y Notificaciones
```
Notificaciones.tsx (carga al iniciar)
  → GET /creditos/alertas
    → Retorna cuotas vencidas, que vencen hoy y próximas (2 días)
    → Filtra por diasRetraso y estado de cuota
```

### 5. Calendario de Cobros
```
Calendario.tsx (visualiza events)
  → Carga eventos tipo "credito"
    → Para cada crédito activo, calcula próximos pagos
    → Muestra en calendario las fechas de vencimiento
```

---

## 📦 Modelos de Base de Datos Clave

### Venta (para créditos)
```prisma
model Venta {
  id                        String
  empresaId                 String
  clienteId                 String?
  metodoPago                MetodoPago  // "CREDITO", "EFECTIVO", etc.
  numeroCuotasCredito       Int?        // 1, 2, 3, 4, 6, 12
  fechaVencimientoCredito   DateTime?   // Calculada: fecha + (plazoMeses * 30)
  total                     Decimal
  abonos                    Abono[]     // Relación: pagos parciales
  // ... otros campos
}
```

### Abono (pagos parciales)
```prisma
model Abono {
  id           String
  clienteId    String
  monto        Decimal
  fecha        DateTime
  referencia   String?     // "Abono a crédito #123"
  // ... otros campos
}
```

---

## 🎮 Pantallas Principales

| Pantalla | Función | Módulos Relacionados |
|----------|---------|----------------------|
| **POS** | Crear venta, seleccionar método pago (incluyendo CREDITO) | Productos, Clientes, ModalCredito |
| **Ventas** | Historial de ventas, filtrar por método pago (CREDITO, EFECTIVO, etc.) | Creditos (para ventas a crédito) |
| **Clientes** | Lista de clientes, mostrar `saldoPendiente`, abonar directamente | Creditos |
| **Créditos** | Listar créditos por estado, ver detalles, historial de pagos, registrar abonos | DetalleCreditoModal |
| **Calendario** | Eventos de negocio, vencimientos de cuotas, reposiciones de stock | Creditos (origen="credito") |
| **Notificaciones** | Centro de alertas: cuotas vencidas, por vencer, pedidos Shopify | Creditos (alertas/alertas) |
| **Reportes** | Análisis de ventas, deuda pendiente, ingresos por período | Creditos, Ventas |

---

## 🔧 Tareas de Desarrollo Comunes

### Agregar un nuevo método de pago
1. Agregar a enum `MetodoPago` en shared/src/index.ts
2. Actualizar POST /ventas en backend/routes/ventas.ts (si necesita lógica especial)
3. Agregar select en POS.tsx (método pago)
4. Actualizar colores/badgesestado en Ventas.tsx

### Cambiar límite de días de vencimiento
1. Modificar en Empresa.diasVencimientoCredito (base de datos)
2. O actualizar default en /creditos/config backend
3. La lógica en `calcularCreditos()` usa este valor automáticamente

### Agregar una nueva columna de filtro en Ventas
1. Agregar estado en componente (useState)
2. Pasar a params del GET /ventas
3. El backend espera parámetros query específicos (ver schema de validación)

### Crear reporte de créditos vencidos
1. GET /creditos?estado=VENCIDO
2. Iterar resultado y exportar con BotonesExportar (ya está implementado)

---

## 🐛 Bugs Conocidos y Fixes Recientes

| Versión | Problema | Solución |
|---------|----------|----------|
| 0.8.4 | Etiquetas imprimían con márgenes | Cambiar `padding: 0.5mm 1mm` → `padding: 0` en printer.ts |
| 0.8.5-0.8.6 | Shopify no sincronizaba productos sin SKU | Generar SKU automático: `SHOP${id}V${varianteId}` |
| 0.8.7 | Timeout en impresora | Agregar 30s timeout a printRecibo |
| 0.8.13 | Modal crédito no guardaba datos | Conectar onConfirmar a cobrar() función |
| 0.8.14 | Créditos no aparecían en Calendario/Notificaciones | Crear endpoints /creditos/alertas y eventos tipo "credito" |
| 0.8.15 | ❌ CRITICO: Campos faltaban en BD | Agregar migration: numeroCuotasCredito, referencia en abonos |

---

## 🚀 Scripts Importantes

```bash
# Instalar dependencias
npm install -w apps/backend -w apps/desktop

# Desarrollo backend
npm run dev -w apps/backend      # Fastify en localhost:3001

# Desarrollo frontend
npm run dev -w apps/desktop      # Electron app

# Build final
npm run build -w apps/backend
npm run dist -w apps/desktop     # Genera .exe instalable

# Migrations Prisma
npx prisma migrate dev --name descripcion
npx prisma db push               # Aplicar cambios a BD
```

---

## 📋 Guía Rápida Para Próximas Sesiones

### Antes de Empezar
1. Revisar commits recientes: `git log --oneline -10`
2. Verificar versión actual en `apps/desktop/package.json`
3. Ver archivo de incidencias si existe (problemas reportados)

### Al Terminar
1. Actualizar versión: `x.y.z` en package.json (ambas apps)
2. Hacer commit con patrón: `v0.8.X: descripción clara`
3. Push a GitHub si existe remoto

### Estructura de Commits
```
v0.8.16: Descripción de cambios

- Cambio específico 1
- Cambio específico 2 (con archivos afectados)
- Fix crítico si aplica

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
```

---

## 📊 Estadísticas del Proyecto

- **Líneas de Código:** ~15,000+ (backend + frontend)
- **Componentes React:** 30+
- **Endpoints API:** 50+
- **Tablas en BD:** 20+
- **Usuarios Activos:** Multi-sucursal, multi-usuario
- **Versión:** v0.8.15 (fase beta avanzada)

---

## 💡 Próximas Mejoras Sugeridas

- [ ] Dashboard con KPIs en tiempo real
- [ ] Exportación a Excel con más detalles
- [ ] Sincronización bidireccional de inventario (ahora es uni-direccional)
- [ ] WhatsApp Bot para notificaciones de deuda
- [ ] Facturación electrónica integrada
- [ ] Multi-idioma (es-CO, en-US)
- [ ] Modo oscuro en UI

---

**Última Revisión:** 2026-08-05 | **Actualizado por:** Claude Haiku 4.5
