# 💳 Sistema de Créditos - Documentación Completa

**Estado:** ✅ COMPLETAMENTE FUNCIONAL Y INTEGRADO (v0.8.15)

## 📋 Descripción General

El sistema de créditos permite:
- ✅ Vender a crédito directamente desde POS
- ✅ Crear clientes nuevos en el modal
- ✅ Configurar número de cuotas (1, 2, 3, 4, 6, 12)
- ✅ Definir plazo en meses (1, 2, 3, 6, 12)
- ✅ Registrar abono inicial (opcional)
- ✅ Ver cronograma de cuotas
- ✅ Registrar abonos parciales
- ✅ Alertas automáticas (vencidas, próximas, hoy)
- ✅ Reporte de deuda por cliente
- ✅ Integración con calendario de pagos
- ✅ Integración con notificaciones

---

## 🎯 Flujo Completo de Uso

### PASO 1: Crear Crédito en POS

**Pantalla:** `screens/Pos.tsx`

1. El usuario selecciona productos y genera el carrito
2. En "Método de pago", selecciona **CREDITO**
3. Se abre automáticamente `ModalCredito`

```
ModalCredito (components/ModalCredito.tsx)
├─ Cliente (selector existente o crear nuevo)
├─ Cuotas (1, 2, 3, 4, 6, 12)
├─ Plazo (1, 2, 3, 6, 12 meses)
├─ Abono inicial (opcional)
└─ Resumen con total, cuota y fecha vencimiento
```

**Datos que se guardan:**

```javascript
// Cuando hace click en "Confirmar Crédito"
cobrar({
  clienteId: "uuid-del-cliente",      // Existente o recién creado
  cuotas: 3,                          // Divide el total en 3 partes
  plazo: 6,                           // Vence en 6 meses
  abonoInicial: 500000                // Abona $500k ahora
})

// El backend calcula:
// - fechaVencimientoCredito = fecha_actual + (plazo * 30 días)
// - numeroCuotasCredito = cuotas
// - pendiente = total - abonoInicial
// - Crea cada cuota distribuida entre fecha_venta y fechaVencimiento
```

---

### PASO 2: Abonar a un Crédito

**Métodos de Abono:**

#### A. Desde Pantalla Créditos (Recomendado)
```
Creditos.tsx (pantalla)
  └─ Tabla de créditos por estado
      └─ Click "Ver info" en una fila
          └─ DetalleCreditoModal abre
              ├─ Muestra total, pagado, pendiente
              ├─ Barra de progreso de pago
              ├─ Próximas fechas de pago (tabla cuotas)
              ├─ Historial de abonos (tabla)
              └─ Input "Registrar abono" (si pendiente > 0)
                  └─ Click "Registrar"
                      └─ POST /creditos/:ventaId/abonar { monto }
```

#### B. Desde Pantalla Clientes
```
Clientes.tsx
  └─ Click en un cliente
      └─ Modal detalle cliente
          ├─ Muestra saldoPendiente
          └─ Click "Abonar" (si saldo > 0)
              └─ Input de monto
                  └─ POST /clientes/:clienteId/abonar { monto }
```

---

### PASO 3: Ver Historial en Pantalla Ventas

**Funcionalidad:** Ver qué ventas fueron a crédito

```
Ventas.tsx
  └─ Filtro "Método de pago" = CREDITO
      └─ Muestra solo ventas a crédito
          └─ Cada fila tiene badge con estado del crédito:
              ├─ 🟢 VIGENTE (activo, dentro de plazo)
              ├─ 🟠 PROXIMO_A_VENCER (< 5 días para vencer)
              ├─ 🔴 VENCIDO (superó fecha vencimiento)
              └─ ⚪ PAGADO (crédito 100% cobrado)
```

---

### PASO 4: Alertas en Notificaciones

**Pantalla:** `screens/Notificaciones.tsx`

Muestra alertas en tiempo real:

```
GET /creditos/alertas
  ├─ Cuotas VENCIDAS (rojo)
  │   └─ Cliente X debe $100k (Cuota 2/3) - 5 días de retraso
  ├─ Cuotas QUE VENCEN HOY (amarillo)
  │   └─ Cliente Y debe $200k (Cuota 1/2) - Vence hoy
  └─ Próximas cuotas (azul, próximos 2 días)
      └─ Cliente Z debe $50k (Cuota 3/6) - Vence en 1 día
```

---

### PASO 5: Calendario de Pagos

**Pantalla:** `screens/Calendario.tsx`

```
Calendario.tsx
  └─ Visualiza eventos tipo "credito"
      └─ Para cada venta a crédito con pendiente > 0:
          ├─ Marca fecha vencimiento con evento
          ├─ Color según estado (vigente, próximo, vencido)
          └─ Click en evento:
              └─ Abre DetalleCreditoModal
```

---

## 🔌 Endpoints API Importantes

### GET `/creditos`
**Lista créditos con filtros**

```bash
# Todos los créditos activos
GET /creditos

# Solo vigentes
GET /creditos?estado=VIGENTE

# Solo vencidos
GET /creditos?estado=VENCIDO

# De una sucursal específica
GET /creditos?sucursalId=xyz123

# De una sucursal + estado
GET /creditos?sucursalId=xyz123&estado=VENCIDO
```

**Response:**
```json
[
  {
    "ventaId": "abc123",
    "consecutivo": 1540,
    "clienteId": "cliente1",
    "clienteNombre": "Juan Pérez",
    "sucursalId": "sucursal1",
    "total": 1000000,
    "pendiente": 600000,
    "fecha": "2026-08-01",
    "fechaVencimiento": "2026-10-01",
    "diasRetraso": 5,
    "estado": "VENCIDO"
  }
]
```

### GET `/creditos/:ventaId/detalle`
**Obtiene detalles completos de un crédito**

```bash
GET /creditos/abc123/detalle
```

**Response:**
```json
{
  "ventaId": "abc123",
  "consecutivo": 1540,
  "clienteId": "cliente1",
  "clienteNombre": "Juan Pérez",
  "total": 1000000,
  "pendiente": 600000,
  "fecha": "2026-08-01",
  "fechaVencimiento": "2026-10-01",
  "diasRetraso": 5,
  "estado": "VENCIDO",
  "cliente": { ... },
  "abonos": [
    { "id": "ab1", "monto": 200000, "fecha": "2026-08-15", "referencia": "Abono parcial" },
    { "id": "ab2", "monto": 200000, "fecha": "2026-08-22", "referencia": "Abono parcial" }
  ],
  "cuotas": 3,
  "plazo": 3
}
```

### POST `/creditos/:ventaId/abonar`
**Registra un pago parcial**

```bash
POST /creditos/abc123/abonar
Content-Type: application/json

{
  "monto": 150000
}
```

**Response:**
```json
{
  "id": "abono123",
  "clienteId": "cliente1",
  "monto": 150000,
  "fecha": "2026-08-05T15:30:00Z",
  "referencia": "Abono a crédito #1540"
}
```

### GET `/creditos/:ventaId/proximos-pagos`
**Calcula cronograma de cuotas**

```bash
GET /creditos/abc123/proximos-pagos
```

**Response:**
```json
[
  {
    "cuota": 1,
    "fecha": "2026-09-01",
    "monto": 333333.33
  },
  {
    "cuota": 2,
    "fecha": "2026-09-30",
    "monto": 333333.33
  },
  {
    "cuota": 3,
    "fecha": "2026-10-30",
    "monto": 333333.34
  }
]
```

### GET `/creditos/alertas`
**Alertas de cobro para notificaciones**

```bash
GET /creditos/alertas
```

**Response:**
```json
[
  {
    "ventaId": "abc123",
    "consecutivo": 1540,
    "clienteNombre": "Juan Pérez",
    "numeroCuota": 1,
    "valorPendiente": 333333.33,
    "fechaVencimiento": "2026-09-01",
    "diasRetraso": 5,
    "tipo": "VENCIDA"
  },
  {
    "ventaId": "def456",
    "consecutivo": 1541,
    "clienteNombre": "María López",
    "numeroCuota": 2,
    "valorPendiente": 250000,
    "fechaVencimiento": "2026-08-05",
    "diasRetraso": 0,
    "tipo": "HOY"
  }
]
```

### GET `/creditos/resumen`
**Estadísticas generales de créditos**

```bash
GET /creditos/resumen
```

**Response:**
```json
{
  "vigentes": 45,
  "proximosAVencer": 12,
  "vencidos": 8,
  "valorVencido": 15000000,
  "valorTotalPendiente": 85000000
}
```

---

## 🗂️ Archivos Clave del Sistema

| Archivo | Función |
|---------|---------|
| `backend/src/routes/creditos.ts` | Lógica de negocio, endpoints API |
| `backend/src/lib/shopify.ts` | Funciones de sincronización (si integra) |
| `backend/prisma/schema.prisma` | Modelos Venta, Abono, Cliente |
| `desktop/src/renderer/src/components/ModalCredito.tsx` | Modal para crear crédito |
| `desktop/src/renderer/src/components/DetalleCreditoModal.tsx` | Modal detalles + abonos |
| `desktop/src/renderer/src/screens/Pos.tsx` | Integración en punto de venta |
| `desktop/src/renderer/src/screens/Creditos.tsx` | Pantalla de gestión de créditos |
| `desktop/src/renderer/src/screens/Clientes.tsx` | Mostrar saldo pendiente |
| `desktop/src/renderer/src/screens/Ventas.tsx` | Filtrar por método pago CREDITO |
| `desktop/src/renderer/src/screens/Notificaciones.tsx` | Alertas de cobro |
| `desktop/src/renderer/src/screens/Calendario.tsx` | Eventos de pagos |

---

## 🔧 Configuración

### Días de Vencimiento por Defecto

```bash
GET /creditos/config
# Response: { "diasVencimientoCredito": 20 }

# Cambiar (requiere permiso)
PATCH /creditos/config
{
  "diasVencimientoCredito": 30
}
```

Esto afecta el cálculo de `estado`:
- Si `ahora > fechaVencimiento` → **VENCIDO**
- Si `fechaVencimiento - ahora <= 5 días` → **PROXIMO_A_VENCER**
- Si `ahora <= fechaVencimiento` → **VIGENTE**

---

## 💾 Estructura de Datos en BD

### Tabla `ventas`
```sql
-- Campos relacionados a créditos:
numeroCuotasCredito INT NULL    -- 1, 2, 3, 4, 6, 12
fechaVencimientoCredito TIMESTAMP NULL
-- Calculado automáticamente:
-- fechaVencimientoCredito = fecha + (plazoMeses * 30 días)
```

### Tabla `abonos`
```sql
id SERIAL PRIMARY KEY
clienteId UUID NOT NULL (FK)
monto DECIMAL NOT NULL
fecha TIMESTAMP DEFAULT NOW()
referencia VARCHAR(255) NULL
```

---

## ⚠️ Límitaciones Conocidas

1. **Abonos se aplican FIFO:** Si un cliente tiene múltiples créditos, los abonos se aplican primero al más antiguo
2. **No hay intereses:** El sistema es simple (no calcula intereses compuestos)
3. **Cuotas son equitativas:** Se distribuyen equitativamente en el tiempo (puede no ser exacto para algunos escenarios)
4. **Sin pago automático:** No hay integración con sistemas de pago automático (ACH, tarjeta, etc.)

---

## ✅ Checklist de Validación

```
☑️ Modal abre al seleccionar CREDITO en POS
☑️ Se puede crear cliente nuevo en el modal
☑️ Crédito se guarda en BD correctamente
☑️ Aparece en listado de Créditos.tsx
☑️ Se puede ver detalles (DetalleCreditoModal)
☑️ Se pueden registrar abonos
☑️ Aparecen en Ventas.tsx filtrados por método pago
☑️ Aparecen saldos en Clientes.tsx
☑️ Alertas en Notificaciones.tsx
☑️ Eventos en Calendario.tsx
```

---

## 🚀 Próximas Funcionalidades

- [ ] Descuentos por pago anticipado
- [ ] Recargos por retraso en pago
- [ ] Renovación automática de crédito (si cliente paga a tiempo)
- [ ] Simulador de cuotas antes de confirmar
- [ ] Historial de créditos cerrados (PAGADO)
- [ ] Integración con WhatsApp para recordatorios
- [ ] Export a Excel del cronograma de pagos

---

**Última Actualización:** 2026-08-05 v0.8.15
