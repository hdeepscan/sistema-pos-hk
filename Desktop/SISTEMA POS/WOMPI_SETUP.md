# 🚀 Configuración de Wompi

Guía paso a paso para integrar Wompi en tu POS HK.

## 📋 Credenciales que Necesitas

Ya tienes todo preparado. Aquí están tus credenciales:

```
🔐 Llave Pública:
pub_prod_7HegT8zTXRJji0gtzz057VBCK0yzWjQ2

🔐 Llave Privada:
prv_prod_lKpHWmv1RIHT7bKiGPnstG1Gu8koIAx6

🔐 Secreto Eventos (Webhooks):
prod_events_QEow9PF4dfdv0srxordcnP6LnaIXboer

🔐 Secreto Integridad:
prod_integrity_5K76a7izUe2LyduzNA2zrGLzzFDbdG6o
```

## 🔧 Paso 1: Configurar Variables de Entorno en Railway

En **Railway Console**:

1. Ir a Variables
2. Agregar estas variables:

```env
WOMPI_PUBLIC_KEY=pub_prod_7HegT8zTXRJji0gtzz057VBCK0yzWjQ2
WOMPI_PRIVATE_KEY=prv_prod_lKpHWmv1RIHT7bKiGPnstG1Gu8koIAx6
WOMPI_EVENTS_SECRET=prod_events_QEow9PF4dfdv0srxordcnP6LnaIXboer
WOMPI_INTEGRITY_SECRET=prod_integrity_5K76a7izUe2LyduzNA2zrGLzzFDbdG6o
API_URL=https://sistema-pos-hk.up.railway.app
```

## 🔗 Paso 2: Confirmar URL de Webhook en Wompi

Ya debe estar configurada, pero verifica:

En Wompi Dashboard → Desarrollo → Programadores:
- **URL de Eventos**: `https://sistema-pos-hk.up.railway.app/api/pagos/webhook`

## 🎯 Paso 3: Agregar CheckoutPage a la Aplicación

En `apps/desktop/src/App.tsx`:

```typescript
import CheckoutPage from "./screens/CheckoutPage";

// En las rutas
<Route path="/checkout" element={<CheckoutPage />} />
```

## 💳 Paso 4: Agregar Botón de Pago en Menú

En el menú principal o dashboard:

```typescript
import { Link } from "react-router-dom";

<Link to="/checkout" className="btn-pagar">
  💳 Renovar Suscripción
</Link>
```

---

## 🧪 Pruebas Locales

### Tarjetas de Prueba Wompi

```
VISA:
  Número: 4111 1111 1111 1111
  CVV: 123
  Fecha: 12/25

MasterCard:
  Número: 5425 2330 1010 3442
  CVV: 123
  Fecha: 12/25
```

### Probar con ngrok (desarrollo local)

```bash
# Terminal 1: Iniciar ngrok
ngrok http 4000

# Obtiene URL como: https://abc123.ngrok.io

# Terminal 2: En Railway Console
# Actualizar WOMPI_URL_WEBHOOK a la URL de ngrok
```

---

## 📊 Flujo de Pago

```
1. Usuario entra a /checkout
   ↓
2. Selecciona plan (Mensual/Trimestral/Anual)
   ↓
3. Clic "Pagar con Wompi"
   ↓
4. POST /checkout/crear
   - Crea transacción en Wompi
   - Retorna URL de Wompi
   ↓
5. Redirección a Wompi Checkout
   - Usuario ingresa tarjeta
   - Wompi procesa pago
   ↓
6. Wompi envía webhook POST /api/pagos/webhook
   ↓
7. Sistema valida firma
   ↓
8. Si aprobado → Licencia se activa automáticamente ✅
   Si rechazado → Se registra como fallido ❌
```

---

## 🔐 Seguridad

### Validación de Webhooks

Wompi usa **HMAC-SHA256** para firmas:

```
signature = HMAC-SHA256(eventsSecret, timestamp.body)
```

El sistema valida automáticamente cada webhook.

### Datos Sensibles

- ✅ Llave privada nunca en el frontend
- ✅ Números de tarjeta procesados por Wompi
- ✅ Tus datos bancarios no en la BD
- ✅ Encriptación TLS en todas las comunicaciones

---

## 📱 Endpoints Implementados

```
GET  /pagos/planes
     → Obtener lista de planes disponibles

POST /checkout/crear
     → Crear transacción en Wompi
     
POST /checkout/confirmar
     → Confirmación de pago (redirect)
     
POST /api/pagos/webhook
     → Webhook de Wompi (webhook automático)
     
GET  /api/pagos/estado/:referencia
     → Consultar estado de un pago
```

---

## 🧾 Estados de Pago Wompi

| Estado | Significado | Acción |
|--------|-----------|--------|
| APPROVED | Pago aprobado ✅ | Licencia se activa |
| DECLINED | Pago rechazado ❌ | Registrar como fallido |
| PENDING | Pendiente | Esperar confirmación |
| VOIDED | Anulado | Contactar soporte |
| ERROR | Error en pago | Reintentar |

---

## 📞 Consultar Transacciones

En Wompi Dashboard → Transacciones:

1. Ver lista de todas las transacciones
2. Filtrar por fecha, monto, estado
3. Ver detalles y webhooks recibidos

---

## 🆘 Solución de Problemas

### Webhook no se recibe
✓ Verifica que la URL sea pública y accesible
✓ Revisa logs en Wompi Dashboard → Webhooks
✓ Usa ngrok si estás en desarrollo

### Pago aprobado pero sin licencia
✓ Revisa logs del servidor: `docker logs nombre-contenedor`
✓ Verifica que metadata tenga empresaId
✓ Confirma que WOMPI_EVENTS_SECRET sea correcto

### Error de firma (signature invalid)
✓ Verifica que WOMPI_EVENTS_SECRET sea exacto
✓ Comprueba que timestamp y body sean correctos
✓ Revisa el valor de timestamp en milisegundos

### Transacción no aparece en BD
✓ Verifica que POST /api/pagos/webhook reciba la petición
✓ Revisa logs: búsca "Webhook Wompi recibido"
✓ Confirma que referencia sea correcta

---

## 📚 Documentación

- **Wompi Docs**: https://dev.wompi.co/
- **API Reference**: https://dev.wompi.co/reference
- **Dashboard**: https://admin.wompi.co/

---

## ✅ Checklist de Configuración

- [x] Credenciales de Wompi obtenidas
- [ ] Variables de entorno en Railway configuradas
- [ ] URL de Webhook registrada en Wompi
- [ ] CheckoutPage importada en App.tsx
- [ ] Ruta /checkout agregada
- [ ] Botón de "Pagar" en menú
- [ ] Probado con tarjeta de prueba
- [ ] Webhook se recibe correctamente
- [ ] Licencia se activa automáticamente

---

¡Listo para recibir pagos! 🎉

Si tienes problemas, contacta a soporte de Wompi: https://dev.wompi.co/
