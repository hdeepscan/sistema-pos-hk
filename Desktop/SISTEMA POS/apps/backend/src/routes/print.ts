import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";

// Importar usb para acceso a Zebra
let usb: any;
try {
  usb = require("usb");
} catch {
  console.warn("[PRINT] Librería USB no disponible");
}

interface EtiquetaData {
  svgCodigoBarras: string;
  nombre: string;
  variante?: string;
  sku: string;
  precio: number;
  copias: number;
}

type EtiquetaFormato = "rollo2" | "rollo1" | "carta" | "zebra3";

// Detectar si una impresora es Zebra
function esZebra(deviceName: string | null): boolean {
  if (!deviceName) return false;
  return /zebra|zt\d+|zpl/i.test(deviceName);
}

// Generar ZPL para Zebra
function generarZPL(etiquetas: EtiquetaData[], formato: EtiquetaFormato): string {
  const config = {
    anchoMm: formato === "zebra3" ? 30 : 50,
    altoMm: 25,
    velocidad: 6,
    darkness: 15,
    dpi: 203,
  };

  const mmAPuntos = (mm: number) => Math.round(mm * 8);
  const anchoZebra = mmAPuntos(config.anchoMm);
  const altoZebra = mmAPuntos(config.altoMm);

  let zpl = "^XA\n";
  zpl += `^LL${altoZebra}\n`;
  zpl += `^PW${anchoZebra}\n`;
  zpl += `^PR${config.velocidad}\n`;
  zpl += `^MD${config.darkness}\n`;

  for (const etiqueta of etiquetas) {
    for (let copia = 0; copia < etiqueta.copias; copia++) {
      // Nombre
      zpl += "^FO10,20\n";
      zpl += "^A0N,25,25\n";
      zpl += `^FD${escapeZpl(etiqueta.nombre.substring(0, 20))}\n`;
      zpl += "^FS\n";

      // Variante
      if (etiqueta.variante) {
        zpl += "^FO10,50\n";
        zpl += "^A0N,15,15\n";
        zpl += `^FD${escapeZpl(etiqueta.variante.substring(0, 25))}\n`;
        zpl += "^FS\n";
      }

      // Código de barras
      zpl += "^FO15,75\n";
      zpl += "^BCN,40,Y,N,N\n";
      zpl += `^FD${escapeZpl(etiqueta.sku)}\n`;
      zpl += "^FS\n";

      // Precio
      zpl += "^FO10,120\n";
      zpl += "^A0N,30,30\n";
      zpl += `^FD$${(etiqueta.precio / 100).toFixed(0)}\n`;
      zpl += "^FS\n";

      zpl += "^XZ\n";
    }
  }

  return zpl;
}

function escapeZpl(text: string): string {
  return text
    .replace(/[^a-zA-Z0-9\s\-_.]/g, "")
    .substring(0, 50);
}

// Enviar ZPL a Zebra por USB
async function enviarZebraUSB(zpl: string): Promise<void> {
  if (!usb) {
    throw new Error("Librería USB no disponible");
  }

  const ZEBRA_VENDOR_ID = 0x0a5f;

  console.log(`[PRINT-ZEBRA] Buscando dispositivos USB...`);
  const devices = usb.getDeviceList();

  let zebraDevice = null;
  for (const device of devices) {
    if (device.deviceDescriptor.idVendor === ZEBRA_VENDOR_ID) {
      zebraDevice = device;
      break;
    }
  }

  if (!zebraDevice) {
    throw new Error("Dispositivo Zebra no encontrado");
  }

  zebraDevice.open();
  console.log(`[PRINT-ZEBRA] Dispositivo abierto`);

  try {
    const buffer = Buffer.from(zpl, "utf8");
    const chunkSize = 4096;

    for (let i = 0; i < buffer.length; i += chunkSize) {
      const chunk = buffer.slice(i, Math.min(i + chunkSize, buffer.length));
      await zebraDevice.controlTransfer(0x40, 0, 0, 0, chunk);
    }

    console.log(`[PRINT-ZEBRA] ✅ ZPL enviado correctamente`);
  } finally {
    zebraDevice.close();
  }
}

export async function printRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // Endpoint universal de impresión
  app.post("/api/print", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { etiquetas, formato, printerName } = request.body as {
        etiquetas: EtiquetaData[];
        formato: EtiquetaFormato;
        printerName?: string | null;
      };

      if (!etiquetas || !Array.isArray(etiquetas)) {
        return reply.code(400).send({ error: "Etiquetas no válidas" });
      }

      console.log(`[PRINT] Solicitud de impresión: ${etiquetas.length} etiqueta(s)`);
      console.log(`[PRINT] Impresora configurada: ${printerName || "NINGUNA"}`);
      console.log(`[PRINT] Formato: ${formato}`);

      // Opción 1: Zebra por USB
      if (esZebra(printerName)) {
        console.log(`[PRINT] Detectada impresora Zebra: ${printerName}`);
        try {
          const zpl = generarZPL(etiquetas, formato);
          console.log(`[PRINT] ZPL generado (${zpl.length} bytes)`);

          await enviarZebraUSB(zpl);

          return reply.send({
            success: true,
            tipo: "zebra",
            mensaje: `${etiquetas.length} etiqueta(s) impresa(s) en Zebra`,
          });
        } catch (zebraErr) {
          console.error(`[PRINT-ZEBRA] Error:`, zebraErr);
          return reply.code(500).send({
            error: `Error imprimiendo en Zebra: ${zebraErr}`,
          });
        }
      }

      // Opción 2: Impresora térmica normal (HTML/PDF)
      if (printerName) {
        console.log(`[PRINT] Imprimiendo en impresora: ${printerName}`);
        // Fallback: generar PDF
        // (Aquí irían funciones de HTML/PDF pero por ahora enviamos error)
        return reply.code(400).send({
          error: "Impresora normal aún no soportada desde backend",
          tipo: "pdf",
        });
      }

      // Opción 3: Sin impresora - solo generar ZPL para descargar
      console.log(`[PRINT] Sin impresora configurada - generando ZPL para descargar`);
      const zpl = generarZPL(etiquetas, formato);

      reply.header("Content-Type", "text/plain");
      reply.header("Content-Disposition", `attachment; filename="etiquetas-${Date.now()}.zpl"`);
      return reply.send(zpl);
    } catch (err) {
      console.error(`[PRINT] Error:`, err);
      return reply.code(500).send({ error: `Error en impresión: ${err}` });
    }
  });
}
