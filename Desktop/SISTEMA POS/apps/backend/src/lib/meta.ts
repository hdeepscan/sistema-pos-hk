import { createHash } from "node:crypto";
import { prisma } from "./prisma.js";

const API_VERSION = "v21.0";

interface InsightRow {
  campaign_id: string;
  campaign_name: string;
  spend: string;
  impressions: string;
  clicks: string;
  date_start: string;
}

// Trae el gasto diario por campaña desde Meta Ads y lo guarda en GastoPauta,
// para poder compararlo contra las ventas en Reportes.
export async function sincronizarGastoPauta(
  empresaId: string,
  desde: string,
  hasta: string
): Promise<{ diasSincronizados: number }> {
  const config = await prisma.metaConfig.findUnique({ where: { empresaId } });
  if (!config) throw new Error("Meta Ads no esta configurado para esta empresa");

  const url = new URL(`https://graph.facebook.com/${API_VERSION}/act_${config.adAccountId}/insights`);
  url.searchParams.set("level", "campaign");
  url.searchParams.set("fields", "campaign_id,campaign_name,spend,impressions,clicks");
  url.searchParams.set("time_increment", "1");
  url.searchParams.set("time_range", JSON.stringify({ since: desde, until: hasta }));
  url.searchParams.set("access_token", config.accessToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`No se pudo consultar Meta Ads (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { data: InsightRow[] };

  for (const fila of data.data) {
    await prisma.gastoPauta.upsert({
      where: {
        empresaId_campaniaId_fecha: {
          empresaId,
          campaniaId: fila.campaign_id,
          fecha: new Date(fila.date_start),
        },
      },
      update: {
        campania: fila.campaign_name,
        gasto: Number(fila.spend),
        impresiones: Number(fila.impressions || 0),
        clics: Number(fila.clicks || 0),
      },
      create: {
        empresaId,
        campaniaId: fila.campaign_id,
        campania: fila.campaign_name,
        fecha: new Date(fila.date_start),
        gasto: Number(fila.spend),
        impresiones: Number(fila.impressions || 0),
        clics: Number(fila.clicks || 0),
      },
    });
  }

  await prisma.metaConfig.update({ where: { empresaId }, data: { ultimaSincronizacion: new Date() } });

  return { diasSincronizados: data.data.length };
}

function hashSha256(valor: string): string {
  return createHash("sha256").update(valor.trim().toLowerCase()).digest("hex");
}

interface DatosVentaParaMeta {
  ventaId: string;
  total: number;
  fecha: Date;
  clienteEmail?: string | null;
  clienteTelefono?: string | null;
}

// Envia un evento de compra a Meta (Conversions API) para que las campañas
// puedan optimizarse con datos reales de venta. Es best-effort: si falla, no
// interrumpe el flujo de la venta.
export async function enviarEventoCompraAMeta(empresaId: string, venta: DatosVentaParaMeta): Promise<void> {
  const config = await prisma.metaConfig.findUnique({ where: { empresaId } });
  if (!config?.pixelId) return;

  const userData: Record<string, string> = {};
  if (venta.clienteEmail) userData.em = hashSha256(venta.clienteEmail);
  if (venta.clienteTelefono) userData.ph = hashSha256(venta.clienteTelefono.replace(/\D/g, ""));

  const body = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(venta.fecha.getTime() / 1000),
        event_id: venta.ventaId,
        action_source: "system_generated",
        user_data: userData,
        custom_data: { currency: "COP", value: venta.total },
      },
    ],
    access_token: config.accessToken,
  };

  try {
    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${config.pixelId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error("[meta] No se pudo enviar el evento de compra:", await res.text());
    }
  } catch (err) {
    console.error("[meta] Error enviando evento de compra:", err);
  }
}
