# 🚀 Configuración de PayU

Esta guía te ayuda a configurar PayU para procesar pagos en tu POS.

## 📋 Requisitos

- Empresa registrada en Colombia o Latinoamérica
- Cuenta bancaria
- Documento de identidad
- Acceso a email para confirmación

## 🔧 Pasos de Configuración

### 1. Crear Cuenta en PayU

1. Ir a: https://admin.payulatam.com/
2. Hacer clic en "Crear cuenta" o "Sign Up"
3. Llenar formulario con:
   - Nombre empresa
   - Email
   - Teléfono
   - Documento de identidad
   - Información bancaria

### 2. Obtener Credenciales

Una vez verificada la cuenta:

1. Ir a Dashboard → Configuración
2. Buscar sección "Credenciales API"
3. Copiar:
   - **Merchant ID**: Tu ID único
   - **Account ID**: ID de la cuenta
   - **API Key**: Clave de seguridad

### 3. Configurar Variables de Entorno

En `apps/backend/.env`:

```env
# PayU Credentials
PAYU_MERCHANT_ID=seu_merchant_id_aqui
PAYU_ACCOUNT_ID=seu_account_id_aqui
PAYU_API_KEY=sua_api_key_aqui

# Modo Sandbox para pruebas
PAYU_SANDBOX=true

# URL de la aplicación
API_URL=https://tu-dominio.com
```

### 4. Modo Sandbox (Pruebas)

PayU proporciona ambiente de pruebas:

**Tarjetas de prueba válidas:**

```
Visa:
- Número: 4111111111111111
- CVV: 123
- Fecha: 12/25

MasterCard:
- Número: 5425233010103442
- CVV: 123
- Fecha: 12/25

American Express:
- Número: 374245455400126
- CVV: 1234
- Fecha: 12/25
```

**Modo Sandbox:** `PAYU_SANDBOX=true`

### 5. Cambiar a Producción

Cuando estés listo para producción:

1. En `apps/backend/.env`:
   ```env
   PAYU_SANDBOX=false
   ```

2. Asegúrate de tener:
   - Credenciales de producción
   - URL correcta: `https://tu-dominio.com`
   - Certificado SSL/HTTPS

## 🔐 Seguridad

### Firmas y Validación

PayU usa firmas MD5 para validar transacciones:

```
Firma = MD5(apiKey~merchantId~referenceCode~amount~currency)
```

El sistema valida automáticamente en el webhook.

### Datos Sensibles

- **NUNCA** expongas la API Key en el frontend
- **NUNCA** guardes números de tarjeta
- PayU maneja PCI DSS Compliance

## 📱 URLs de Callback

El sistema usa estas URLs:

- **Response URL**: `https://tu-dominio.com/api/checkout/confirmar`
- **Webhook URL**: `https://tu-dominio.com/api/pagos/webhook`

Asegúrate de que sean accesibles públicamente.

## 🧪 Pruebas Locales

Para probar localmente con webhooks:

Opción 1: Usar ngrok
```bash
ngrok http 4000
# Luego actualizar API_URL con URL de ngrok
```

Opción 2: Usar curl para simular webhook
```bash
curl -X POST http://localhost:4000/api/pagos/webhook \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "reference_sale=POS-123&state=4&value=40000&currency=COP"
```

## 📊 Consultar Transacciones

En Dashboard de PayU:

1. Ir a "Transacciones"
2. Filtrar por fecha, monto o referencia
3. Ver detalles y estados

Estados de PayU:
- **4**: Aprobada ✅
- **5**: Rechazada ❌
- **6**: Expirada ⏱️
- **7**: Pendiente ⏳
- **12**: En revisión 🔍

## 🆘 Solución de Problemas

### Error: "Signature inválido"
- Verifica que la API Key sea correcta
- Asegúrate de que el formato de datos sea correcto

### Error: "Merchant no encontrado"
- Verifica MERCHANT_ID y ACCOUNT_ID
- Confirm que estés usando la URL correcta (sandbox vs producción)

### Webhook no se recibe
- Verifica que tu URL sea públicamente accesible
- Comprueba logs en Dashboard → Logs/Webhooks
- Usa ngrok si estás en desarrollo local

### Pago aprobado pero sin licencia
- Verifica que extra1 tenga datos correctos
- Revisa logs del servidor: `docker logs nombre-contenedor`

## 📞 Soporte

- **PayU**: https://help.payulatam.com/
- **Chat**: Disponible en admin.payulatam.com
- **Email**: support@payulatam.com

## 📚 Referencias

- API Docs: https://developers.payulatam.com/
- Integración: https://developers.payulatam.com/es/docs/checkout/integration-guide/
- Testing: https://developers.payulatam.com/es/docs/checkout/test-your-integration/

---

¡Listo! Tu POS está configurado para recibir pagos con PayU. 🎉
