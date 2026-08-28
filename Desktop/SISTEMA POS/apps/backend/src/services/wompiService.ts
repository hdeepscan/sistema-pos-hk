/**
 * Servicio de integración con Wompi
 * Pasarela de pagos colombiana
 */

import axios from "axios";
import crypto from "crypto";

// Configuración de Wompi
const WOMPI_CONFIG = {
  API_URL: "https://api.wompi.co/v1",
  PUBLIC_KEY: process.env.WOMPI_PUBLIC_KEY || "",
  PRIVATE_KEY: process.env.WOMPI_PRIVATE_KEY || "",
  EVENTS_SECRET: process.env.WOMPI_EVENTS_SECRET || "",
  INTEGRITY_SECRET: process.env.WOMPI_INTEGRITY_SECRET || "",
};

export interface WompiOrderData {
  empresaId: string;
  referenciaPago: string;
  tipoPlan: "TRIAL_5D" | "MENSUAL" | "TRIMESTRAL" | "ANUAL";
  monto: number;
  usuariosAdicionales?: number;
  email: string;
  nombre: string;
  telefono?: string;
}

export interface WompiCheckoutResponse {
  url: string;
  referenciaPago: string;
  monto: number;
  tipoPlan: string;
}

export class WompiService {
  private apiUrl: string;
  private publicKey: string;
  private privateKey: string;
  private eventsSecret: string;
  private integritySecret: string;
  private apiClient: any;

  constructor() {
    this.apiUrl = WOMPI_CONFIG.API_URL;
    this.publicKey = WOMPI_CONFIG.PUBLIC_KEY;
    this.privateKey = WOMPI_CONFIG.PRIVATE_KEY;
    this.eventsSecret = WOMPI_CONFIG.EVENTS_SECRET;
    this.integritySecret = WOMPI_CONFIG.INTEGRITY_SECRET;

    // Crear cliente axios con autenticación
    this.apiClient = axios.create({
      baseURL: this.apiUrl,
      headers: {
        Authorization: `Bearer ${this.privateKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!this.publicKey || !this.privateKey) {
      console.warn("⚠️ Wompi credentials not configured. Payments will fail.");
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
   * Crear transacción en Wompi
   */
  async crearOrdenPago(datos: WompiOrderData): Promise<WompiCheckoutResponse> {
    try {
      const referenciaPago = datos.referenciaPago || this.generarReferenciaPago();
      const monto = Math.round(datos.monto * 100); // Wompi usa centavos

      // Debug: Log datos exactos
      console.log("📊 Datos para Wompi Link:");
      console.log("  Public Key:", this.publicKey?.substring(0, 10) + "...");
      console.log("  Monto (centavos):", monto);
      console.log("  Referencia:", referenciaPago);
      console.log("  Moneda: COP");

      // Usar Wompi Web Checkout dinámico (/p/ con parámetros)
      const checkoutUrl = `https://checkout.wompi.co/p/?public-key=${this.publicKey}&currency=COP&amount-in-cents=${monto}&reference=${referenciaPago}`;

      console.log("🔗 Checkout URL:", checkoutUrl);
      console.log(`✓ Checkout Wompi creado: ${referenciaPago}`);

      return {
        url: checkoutUrl,
        referenciaPago,
        monto: datos.monto,
        tipoPlan: datos.tipoPlan,
      };
    } catch (error: any) {
      const wompiError = error?.response?.data || error?.message;
      console.error("❌ Error creando orden Wompi:", JSON.stringify(wompiError, null, 2));
      console.error("Status:", error?.response?.status);
      console.error("Email enviado:", datos.email);
      console.error("Monto (en centavos):", Math.round(datos.monto * 100));
      throw error;
    }
  }

  /**
   * Obtener detalles de transacción
   */
  async obtenerTransaccion(transactionId: string): Promise<any> {
    try {
      const response = await this.apiClient.get(`/transactions/${transactionId}`);
      return response.data.data;
    } catch (error) {
      console.error("Error obteniendo transacción:", error);
      throw error;
    }
  }

  /**
   * Procesar webhook de Wompi
   */
  async procesarWebhook(data: any): Promise<boolean> {
    try {
      const { transaction } = data;
      const { reference, status, amount_in_cents } = transaction;

      console.log(`📨 Webhook Wompi recibido: ${reference} - Estado: ${status}`);

      // Estados de Wompi:
      // APPROVED = Aprobada
      // PENDING = Pendiente
      // DECLINED = Rechazada
      // VOIDED = Anulada
      // ERROR = Error

      if (status === "APPROVED") {
        console.log(`✓ Pago aprobado: ${reference}`);
        return true;
      } else if (status === "DECLINED") {
        console.log(`✗ Pago rechazado: ${reference}`);
        return false;
      } else {
        console.log(`⏳ Estado de pago: ${status}`);
        return false;
      }
    } catch (error) {
      console.error("Error procesando webhook Wompi:", error);
      throw error;
    }
  }

  /**
   * Validar signature del webhook de Wompi
   * Wompi usa HMAC-SHA256 para firmas
   */
  validarSignatureWebhook(
    signature: string,
    timestamp: string,
    body: string
  ): boolean {
    try {
      // El signature de Wompi se calcula como:
      // HMAC-SHA256(eventsSecret, timestamp + "." + body)
      const message = `${timestamp}.${body}`;
      const expectedSignature = crypto
        .createHmac("sha256", this.eventsSecret)
        .update(message)
        .digest("hex");

      return signature === expectedSignature;
    } catch (error) {
      console.error("Error validando signature:", error);
      return false;
    }
  }

  /**
   * Validar integridad de datos
   */
  validarIntegridad(referencia: string): string {
    const integrity = crypto
      .createHmac("sha256", this.integritySecret)
      .update(referencia)
      .digest("hex");

    return integrity;
  }
}

export const wompiService = new WompiService();
