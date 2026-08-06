# 💼 SISTEMA POS HK

![Version](https://img.shields.io/badge/version-0.8.16-blue.svg)
![Status](https://img.shields.io/badge/status-production-brightgreen.svg)

**Sistema POS HK** es una solución completa de punto de venta multi-sucursal con:
- ✅ **App Desktop (Electron)** - Windows instalable
- ✅ **Backend API (Fastify)** - Escalable en la nube
- ✅ **Sistema de Créditos Completo** - Cuotas, abonos, notificaciones (v0.8.13+)
- ✅ **Integración Shopify** - Sincronización bidireccional
- ✅ **Impresoras Térmicas** - Etiquetas y recibos
- ✅ **Fidelización y Reportes** - Análisis avanzados
- ✅ **Multi-Sucursal & Multi-Tenant** - Empresas aisladas

## 🚀 Inicio Rápido

### Ejecutar la Aplicación
1. **Opción 1 (Instalador):** Busca "Sistema POS HK" en tu escritorio
2. **Opción 2 (Manual):** `apps/desktop/release/Sistema POS HK Setup 0.8.15.exe`

### Modo Desarrollo
```bash
# Instalar dependencias
npm install

# Backend (localhost:3001)
npm run dev -w apps/backend

# Desktop (Electron)
npm run dev -w apps/desktop

# Compilar instalador
npm run dist -w apps/desktop
```

## 📚 Documentación Completa

| Documento | Contenido |
|-----------|----------|
| **[PROYECTO_CONTEXTO.md](PROYECTO_CONTEXTO.md)** | Arquitectura, carpetas, workflows, bug fixes |
| **[SISTEMA_CREDITOS.md](SISTEMA_CREDITOS.md)** | Flujos de crédito, APIs, endpoints, ejemplos |
| **[README.md](README.md)** | Este archivo |

## 📊 Características por Versión

### v0.8.16 (Actual)
- ✅ Documentación completa del proyecto
- ✅ Acceso directo en escritorio
- ✅ Guía para futuras sesiones

### v0.8.15
- ✅ **Fix Crítico:** campos faltaban en BD (numeroCuotasCredito, referencia)

### v0.8.13-0.8.14
- ✅ **Sistema de Créditos Completo:**
  - Modal en POS para crear créditos
  - Seleccionar cuotas (1-12) y plazo (meses)
  - Cronograma de cuotas automático
  - Registrar abonos parciales
  - Alertas de vencimientos
  - Integración Calendario + Notificaciones

### v0.8.5-0.8.12
- Sincronización Shopify de productos sin SKU
- Fix etiquetas sin márgenes
- Descuentos, devoluciones, puntos de fidelización
- Caja y reportes básicos

## 🎯 Casos de Uso Principales

### 1. Vender a Crédito
```
POS → Método Pago = CREDITO → ModalCredito abre
→ Seleccionar cliente → Elegir cuotas y plazo → CONFIRMAR
→ Crédito guardado en BD con cronograma de pagos
```

### 2. Gestionar Crédito
```
Créditos → Filtrar por estado → "Ver info"
→ Historial de pagos + próximas cuotas + registrar abono
```

### 3. Ver Alertas
```
Notificaciones → Cuotas vencidas/próximas → Click abre detalles
```

### 4. Analizar Deuda
```
Clientes → Muestra saldoPendiente por cliente
Reportes → Deuda consolidada por sucursal/período
```

## 🏗️ Estructura del Proyecto

```
apps/
├── backend/                  # API Fastify + Prisma
│   ├── src/routes/
│   │   ├── ventas.ts        # Crear ventas, descuentos
│   │   ├── creditos.ts      # ⭐ Sistema de créditos
│   │   ├── clientes.ts      # Clientes y deuda
│   │   ├── shopify.ts       # Sincronización
│   │   └── ...
│   └── prisma/schema.prisma # Modelos BD
│
└── desktop/                  # Electron + React
    └── src/
        ├── components/       # ModalCredito, DetalleCreditoModal
        └── screens/
            ├── Pos.tsx       # Punto de venta ⭐
            ├── Creditos.tsx  # Gestión créditos ⭐
            ├── Clientes.tsx  # Deuda pendiente
            ├── Ventas.tsx    # Historial
            ├── Calendario.tsx# Eventos de pago
            ├── Notificaciones.tsx# Alertas
            └── ...

packages/shared/             # Tipos TypeScript compartidos
```

## 🔧 Requisitos del Sistema

- **SO:** Windows 10/11 64-bit
- **RAM:** 4GB (8GB recomendado)
- **Node.js:** 20+ (para desarrollo)
- **Base de Datos:** PostgreSQL (Neon recomendado)
- **Conexión:** Internet (sincronización)

## 🔐 Configuración Inicial

1. **Crear empresa:** En login → "Registrar empresa"
2. **Agregar sucursal:** Configuración → Nueva sucursal
3. **Conectar Shopify:** Configuración → Shopify → OAuth
4. **Crear productos:** Inventario → Nuevo producto
5. **Configurar impresora:** Configuración → Seleccionar impresora

## 💡 Tips de Desarrollo

### Ver cambios en tiempo real
- Backend: `npm run dev -w apps/backend` (Fastify refresca automáticamente)
- Desktop: `npm run dev -w apps/desktop` (Electron refresca al guardar)

### Debuggear BD
- Usar Prisma Studio: `npx prisma studio`
- O acceder a Neon dashboard directamente

### Ver logs de app
- Windows: `%APPDATA%/Sistema POS HK/` 
- Consola de desarrollo: F12 en Electron

### Generar migración
```bash
npx prisma migrate dev --name descripcion_cambio
```

## ⚠️ Problemas Comunes

| Problema | Solución |
|----------|----------|
| "No se conecta al servidor" | Verificar URL en login, backend encendido |
| Productos no sincroniza | Ir a Shopify config, re-autenticar OAuth |
| Impresora no funciona | Instalar driver, seleccionar en Configuración |
| Base de datos error | Ejecutar `npx prisma db push` |

## 📈 Estadísticas

- **Endpoints API:** 50+
- **Tablas BD:** 20+
- **Componentes React:** 30+
- **Líneas de código:** 15,000+
- **Usuarios:** Multi-sucursal, multi-usuario

## 🎓 Para Próximas Sesiones

1. **Lee primero:** PROYECTO_CONTEXTO.md y SISTEMA_CREDITOS.md
2. **Ver commits:** `git log --oneline -10`
3. **Cambios recientes:** Ver último commit y PRs
4. **Estructura:** Ver carpetas clave en el documento de contexto

## 🚀 Próximas Mejoras

- [ ] Dashboard con KPIs
- [ ] Exportación a Excel detallada
- [ ] WhatsApp Bot para notificaciones
- [ ] Facturación electrónica DIAN
- [ ] Aplicación web (PWA)
- [ ] Modo oscuro
- [ ] Descuentos por pago anticipado

## 📞 Contacto & Soporte

- **Developer:** hdeepscan (hnieto@deepscan.com.co)
- **Tech Stack:** React, Electron, Fastify, PostgreSQL, TypeScript
- **Última Actualización:** 2026-08-05 v0.8.16

---

**Estado:** ✅ Producción - Sistema estable y completamente funcional
