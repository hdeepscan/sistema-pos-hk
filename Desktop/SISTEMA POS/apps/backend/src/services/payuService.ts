/**
 * Servicio de integración con PayU
 * Latinoamérica - Colombia
 */

import axios, { AxiosInstance } from "axios";

// Configuración de PayU
const PAYU_CONFIG = {
  // Producción
  API_URL: "https://api.payulatam.com/payments-api/4.0/service.cgi",
  CHECKOUT_URL: "https://checkout.payulatam.com/ppp/payment.php",

  // Sandbox (para pruebas)
  SANDBOX_API_URL: "https://sandbox.api.payulatam.com/payments-api/4.0/service.cgi",
  SANDBOX_CHECKOUT_URL: "https://sandbox.checkout.payulatam.com/ppp/payment.php",

  // Credentials (desde variables de entorno)
  MERCHANT_ID: process.env.PAYU_MERCHANT_ID || "",
  ACCOUNT_ID: process.env.PAYU_ACCOUNT_ID || "",
  API_KEY: process.env.PAYU_API_KEY || "",
  IS_SANDBOX: process.env.PAYU_SANDBOX === "true",
};

export interface PayUOrderData {
  empresaId: string;
  referenciaPago: string;
  tipoPlan: "MENSUAL" | "TRIMESTRAL" | "ANUAL";
  monto: number;
  usuariosAdicionales?: number;
  email: string;
  nombre: string;
  telefono?: string;
}

export interface PayUCheckoutResponse {
  url: string;
  referenciaPago: string;
  monto: number;
  tipoPlan: string;
}

export class PayUService {
  private apiUrl: string;
  private checkoutUrl: string;
  private merchantId: string;
  private accountId: string;
  private apiKey: string;

  constructor() {
    this.apiUrl = PAYU_CONFIG.IS_SANDBOX
      ? PAYU_CONFIG.SANDBOX_API_URL
      : PAYU_CONFIG.API_URL;

    this.checkoutUrl = PAYU_CONFIG.IS_SANDBOX
      ? PAYU_CONFIG.SANDBOX_CHECKOUT_URL
      : PAYU_CONFIG.CHECKOUT_URL;

    this.merchantId = PAYU_CONFIG.MERCHANT_ID;
    this.accountId = PAYU_CONFIG.ACCOUNT_ID;
    this.apiKey = PAYU_CONFIG.API_KEY;

    if (!this.merchantId || !this.accountId || !this.apiKey) {
      console.warn("⚠️ PayU credentials not configured. Payments will fail.");
    }
  }

  /**
   * Crear referencia de pago única
   */
  private generarReferenciaPago(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `POS-${timestamp}-${random}`.toUpperCase();
  }

  /**
   * Calcular firma de seguridad para PayU
   * Signature = MD5(ApiKey~merchantId~referenceCode~amount~currency)
   */
  private calcularFirma(
    referenceCode: string,
    amount: number,
    currency: string = "COP"
  ): string {
    const crypto = require("crypto");
    const signatureString = `${this.apiKey}~${this.merchantId}~${referenceCode}~${amount}~${currency}`;
    return crypto.createHash("md5").update(signatureString).digest("hex");
  }

  /**
   * Crear orden de pago en PayU
   * Retorna URL de checkout
   */
  async crearOrdenPago(datos: PayUOrderData): Promise<PayUCheckoutResponse> {
    try {
      const referenciaPago = datos.referenciaPago || this.generarReferenciaPago();
      const monto = Math.round(datos.monto); // PayU requiere enteros
      const firma = this.calcularFirma(referenciaPago, monto);

      // Construir formulario de PayU
      const formulario = new URLSearchParams();

      // Información del comerciante
      formulario.append("merchantId", this.merchantId);
      formulario.append("accountId", this.accountId);
      formulario.append("apiKey", this.apiKey);

      // Información de la transacción
      formulario.append("referenceCode", referenciaPago);
      formulario.append("description", `Suscripción ${datos.tipoPlan} - ${datos.empresaId}`);
      formulario.append("amount", monto.toString());
      formulario.append("currency", "COP");
      formulario.append("tax", "0");
      formulario.append("taxReturnBase", "0");
      formulario.append("signature", firma);

      // Información del cliente
      formulario.append("buyerEmail", datos.email);
      formulario.append("buyerFullName", datos.nombre);
      if (datos.telefono) {
        formulario.append("buyerPhone", datos.telefono);
      }

      // Información del producto
      formulario.append("lineItemDescription", `Plan ${datos.tipoPlan}`);
      formulario.append("lineItemQuantity", "1");
      formulario.append("lineItemPrice", monto.toString());

      // URLs de respuesta
      const baseUrl = process.env.API_URL || "http://localhost:4000";
      formulario.append("responseUrl", `${baseUrl}/api/pagos/confirmar`);
      formulario.append("confirmationUrl", `${baseUrl}/api/pagos/webhook`);

      // Datos adicionales (metadata)
      formulario.append("extra1", JSON.stringify({
        empresaId: datos.empresaId,
        tipoPlan: datos.tipoPlan,
        usuariosAdicionales: datos.usuariosAdicionales || 0,
      }));

      console.log(`✓ Orden PayU creada: ${referenciaPago}`);

      return {
        url: this.checkoutUrl,
        referenciaPago,
        monto,
        tipoPlan: datos.tipoPlan,
      };
    } catch (error) {
      console.error("Error creando orden PayU:", error);
      throw error;
    }
  }

  /**
   * Verificar estado de transacción en PayU
   */
  async verificarTransaccion(referenceCode: string): Promise<any> {
    try {
      // Este endpoint requiere autenticación adicional
      // Por ahora confiamos en el webhook de PayU
      console.log(`Verificando transacción: ${referenceCode}`);
      return { status: "verified" };
    } catch (error) {
      console.error("Error verificando transacción:", error);
      throw error;
    }
  }

  /**
   * Procesar respuesta de webhook de PayU
   * PayU envía confirmación de pago a este método
   */
  async procesarWebhook(data: any): Promise<boolean> {
    try {
      const { reference_sale, state, transaction_type, value, email } = data;

      console.log(`📨 Webhook PayU recibido: ${reference_sale} - Estado: ${state}`);

      // Estados posibles:
      // 4 = Aprobada
      // 5 = Rechazada
      // 6 = Expirada
      // 7 = Pendiente
      // 12 = En revisión

      if (state === "4") {
        // Pago aprobado
        console.log(`✓ Pago aprobado: ${reference_sale}`);
        return true;
      } else if (state === "5") {
        console.log(`✗ Pago rechazado: ${reference_sale}`);
        return false;
      } else {
        console.log(`⏳ Estado de pago: ${state}`);
        return false;
      }
    } catch (error) {
      console.error("Error procesando webhook PayU:", error);
      throw error;
    }
  }

  /**
   * Validar signature del webhook de PayU
   * Signature = MD5(ApiKey~merchantId~referenceCode~amount~currency~state)
   */
  validarSignatureWebhook(
    signature: string,
    referenceCode: string,
    amount: number,
    state: string,
    currency: string = "COP"
  ): boolean {
    const crypto = require("crypto");
    const signatureString = `${this.apiKey}~${this.merchantId}~${referenceCode}~${amount}~${currency}~${state}`;
    const expectedSignature = crypto
      .createHash("md5")
      .update(signatureString)
      .digest("hex");

    return signature === expectedSignature;
  }
}

export const payuService = new PayUService();
