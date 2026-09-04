# 📋 Tareas Pendientes y Mejoras Sugeridas

**Última Actualización:** 2026-08-05 v0.8.16  
**Estado:** Sistema en producción, mejoras backlog

---

## 🔴 Tareas Críticas (No hay actualmente)

El sistema está en estado de producción sin bugs críticos conocidos.

---

## 🟡 Tareas de Alta Prioridad

### 1. Descuentos por Pago Anticipado
- **Descripción:** Permitir configurar descuento si el cliente paga crédito antes de fecha vencimiento
- **Archivos Afectados:** 
  - `backend/src/routes/creditos.ts` - Lógica de cálculo
  - `backend/prisma/schema.prisma` - Campo descuentoAnticipo
  - `desktop/src/components/DetalleCreditoModal.tsx` - Mostrar descuento
- **Complejidad:** Media

### 2. Recargos por Retraso (Intereses)
- **Descripción:** Cargar interés diario o mensual por crédito vencido
- **Archivos Afectados:**
  - `backend/src/routes/creditos.ts` - Calcular intereses
  - `backend/prisma/schema.prisma` - Campos tasaInteres
  - `desktop/src/screens/Creditos.tsx` - Mostrar total con intereses
- **Complejidad:** Alta
- **Nota:** Verificar normativa tributaria para intereses

### 3. Sincronización Bidireccional de Inventario
- **Descripción:** Actualizar stock en Shopify cuando cambia en POS
- **Estado Actual:** Solo sincroniza de Shopify → POS
- **Archivos Afectados:**
  - `backend/src/lib/shopify.ts` - Nueva función actualizarProductoShopify()
  - `backend/src/routes/inventario.ts` - Hook post-venta
- **Complejidad:** Alta
- **Nota:** Aumentaría costo de API Shopify

---

## 🟢 Tareas de Mediana Prioridad

### 4. Renovación Automática de Crédito
- **Descripción:** Si cliente paga créditos a tiempo, renovar línea automáticamente
- **Beneficio:** Menos pasos manuales, fidelización
- **Complejidad:** Media
- **Archivos:** `backend/src/routes/creditos.ts`

### 5. Historial de Créditos Cerrados (Reportes)
- **Descripción:** Poder ver créditos PAGADO en pantalla Créditos.tsx
- **Estado Actual:** Se filtra hacia estado != PAGADO
- **Solución Fácil:** Agregar tab "Pagados" en Creditos.tsx
- **Complejidad:** Baja

### 6. Simulador de Cuotas
- **Descripción:** Antes de crear crédito, simular cómo se divide en cuotas
- **Ubicación:** Nueva sección en ModalCredito.tsx
- **Complejidad:** Baja
- **Beneficio:** Mayor claridad para cliente

### 7. Integración WhatsApp para Notificaciones
- **Descripción:** Enviar recordatorio de pago a cliente por WhatsApp
- **Servicio Sugerido:** Twilio, MessageBird
- **Archivos:** Nuevo `backend/src/lib/whatsapp.ts`
- **Complejidad:** Media
- **Costo:** Pagado (pero bajo)

### 8. Exportación a Excel Avanzada
- **Descripción:** Exportar cronograma de cuotas con gráficos
- **Herramienta:** `exceljs` en lugar de `xlsx`
- **Archivos:** Mejorar `desktop/src/lib/BotonesExportar.tsx`
- **Complejidad:** Media

---

## 🔵 Tareas de Baja Prioridad

### 9. Dashboard con KPIs
- **Descripción:** Pantalla inicial con métricas clave (ventas hoy, cartera vencida, etc.)
- **Ubicación:** Nueva pantalla `screens/Dashboard.tsx`
- **Complejidad:** Media-Alta
- **Nota:** Requiere agregación de datos en tiempo real

### 10. Facturación Electrónica DIAN
- **Descripción:** Integración con DIAN para facturas electrónicas
- **Alcance:** Colombiano, normativa legal
- **Complejidad:** Muy Alta
- **Costo:** Alto (librería especializada)
- **Nota:** Diferir a versión 1.0 o posterior

### 11. Aplicación Web (PWA)
- **Descripción:** Versión web de la app con capacidades offline
- **Tecnología:** Migrar React a Next.js, agregar Service Workers
- **Complejidad:** Muy Alta
- **Nota:** Proyecto separado potencialmente

### 12. Modo Oscuro
- **Descripción:** Tema oscuro en UI
- **Librerías:** `@stitches/react` o CSS variables
- **Complejidad:** Baja-Media
- **Beneficio:** UX mejorada

### 13. Multi-idioma (i18n)
- **Descripción:** Soportar español, inglés, portugués
- **Librería:** `i18next`
- **Complejidad:** Baja (pero tedioso)
- **Beneficio:** Mercado potencial mayor

---

## 🧪 Tareas de Testing & QA

### 14. Pruebas Unitarias
- **Status:** 0%
- **Archivos:** `backend/src/routes/creditos.ts` es crítico
- **Framework:** Jest
- **Prioridad:** Media

### 15. Pruebas de Integración
- **Status:** Manual solamente
- **Automatizar:** Flujos de crédito de principio a fin
- **Tool:** Cypress o Playwright
- **Prioridad:** Baja-Media

### 16. Performance Testing
- **Status:** No hecho
- **Escenarios:** 1000+ créditos, 50+ sucursales
- **Tool:** k6 o Apache JMeter
- **Prioridad:** Baja (a menos que haya usuarios)

---

## 🔐 Tareas de Seguridad

### 17. Validación de Permisos en Créditos
- **Status:** ✅ Implementado (`app.authenticate`)
- **Verificar:** Que usuarios no puedan editar créditos de otras empresas
- **Complejidad:** Baja (revisar)

### 18. Rate Limiting en API
- **Status:** ❌ No implementado
- **Descripción:** Limitar requests por usuario
- **Librería:** `@fastify/rate-limit`
- **Prioridad:** Media

### 19. Encriptación de Datos Sensibles
- **Status:** Parcial (JWT, HTTPS)
- **Mejorar:** Encriptar números de teléfono, cédula
- **Prioridad:** Baja

---

## 📊 Tareas de Reporting & Analytics

### 20. Reportes de Cobranza
- **Descripción:** Comisiones por cobranza, effectiveness ratios
- **Ubicación:** Nueva pantalla `screens/ReportesCobranza.tsx`
- **Complejidad:** Media

### 21. Análisis de Comportamiento de Crédito
- **Descripción:** Cliente con más atrasos, tasa de recuperación, etc.
- **Herramienta:** Gráficos con `recharts` o `chart.js`
- **Complejidad:** Media

### 22. Auditoría Completa de Cambios
- **Status:** Parcial (auditoria.ts existe)
- **Mejorar:** Logging más detallado de abonos
- **Complejidad:** Baja

---

## 🎨 Tareas de UI/UX

### 23. Mejorar Modal de Créditos
- **Issues Actuales:**
  - Campo "Abono inicial" puede confundir
  - No hay validación en tiempo real
- **Mejoras:**
  - Tooltip explicativo
  - Preview de cómo se ve el calendrio
  - Validación mientras escribe

### 24. Estados Visuales Mejorados
- **Descripción:** Usar iconos + colores más claros
- **Ejemplos:**
  - 🟢 VIGENTE (verde)
  - 🟠 PROXIMO_A_VENCER (naranja)
  - 🔴 VENCIDO (rojo)
  - ⚪ PAGADO (gris)
- **Ubicación:** Ya parcialmente implementado, mejorar

### 25. Responsive Design para Tablet
- **Status:** Desktop-only actualmente
- **Descripción:** Hacer UI responsiva para pantallas táctiles
- **Complejidad:** Media
- **Nota:** Electron puede correr en tablet con Windows

---

## 🔧 Tareas de Mantenimiento

### 26. Actualizar Dependencias
- **Cadencia:** Trimestral
- **Herramienta:** `npm update` y revisar breaking changes
- **Prioridad:** Media
- **Nota:** Especialmente Electron, React

### 27. Optimizar Bundle Size
- **Status:** Desktop app es ~2.4GB después de construir
- **Mejoras Posibles:**
  - Lazy loading de rutas
  - Tree shaking de dependencias no usadas
  - Comprimir assets estáticos
- **Complejidad:** Media-Alta

### 28. Documentación Actualizada
- **Status:** ✅ v0.8.16 tiene docs completas
- **Mantenimiento:** Actualizar cuando haya cambios de API
- **Prioridad:** Baja (pero importante)

---

## 📱 Features Futuros (Backlog Largo Plazo)

- [ ] Aplicación móvil (iOS/Android) con React Native
- [ ] Integración con sistemas de pago (Stripe, MercadoPago)
- [ ] CRM integrado con clientes
- [ ] Marketing automation (SMS, email)
- [ ] Sistema de comisiones avanzado
- [ ] Logística y entregas
- [ ] Business intelligence y dashboards
- [ ] API pública para integradores

---

## ✅ Cómo Usar Esta Lista

1. **Elegir una tarea:** Seleccionar por prioridad (🔴 > 🟡 > 🟢 > 🔵)
2. **Leer la descripción:** Entender qué se necesita
3. **Ver archivos:** Saber dónde hacer cambios
4. **Estimar esfuerzo:** Complejidad te dice si es trabajo rápido
5. **Hacer commit:** `v0.8.17: [Nombre tarea] - breve descripción`

---

## 📈 Estadísticas de Tareas

| Severidad | Cantidad | Tiempo Estimado |
|-----------|----------|-----------------|
| 🔴 Críticas | 0 | - |
| 🟡 Alta | 4 | 20-30h |
| 🟢 Media | 5 | 15-25h |
| 🔵 Baja | 8 | 10-20h |
| 🧪 Testing | 3 | 30-50h |
| 📊 Reportes | 3 | 15-20h |
| 🎨 UI/UX | 3 | 10-15h |
| 🔧 Mantenimiento | 3 | 5-10h |

**Total Backlog:** 32 tareas | **Tiempo Estimado:** 120-190 horas

---

**Última Revisión:** 2026-08-05  
**Próxima Revisión:** 2026-09-05 (o cuando se complete una tarea)
