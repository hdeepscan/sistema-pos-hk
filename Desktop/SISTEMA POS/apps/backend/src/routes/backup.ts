import type { FastifyInstance } from "fastify";
import { spawn } from "node:child_process";
import { prisma } from "../lib/prisma.js";
import { registrarAuditoria } from "../lib/auditoria.js";

const PG_DUMP = process.env.PG_DUMP_PATH || "pg_dump";
const PSQL = process.env.PSQL_PATH || "psql";

// pg_dump vuelca TODA la base de datos, no una empresa en particular. Eso es
// exactamente lo que se quiere en un servidor local dedicado a un solo
// negocio (el caso de uso de esta funcion), pero seria una fuga de datos
// entre negocios si esta misma base la comparten varias empresas (como la
// base de desarrollo compartida). Por eso se bloquea si hay mas de una.
async function verificarBaseDeUnaSolaEmpresa(): Promise<string | null> {
  const total = await prisma.empresa.count();
  if (total > 1) {
    return "Esta base de datos aloja mas de una empresa (es un servidor compartido), asi que el respaldo/restauracion completa no esta disponible aqui para evitar mezclar datos entre negocios. Esta funcion es para instalaciones de servidor local dedicadas a una sola empresa.";
  }
  return null;
}

export async function backupRoutes(app: FastifyInstance) {
  // Content-type propio para restaurar: el cuerpo es el .sql crudo, no JSON.
  app.addContentTypeParser("application/sql", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });

  app.addHook("preHandler", app.authenticate);

  app.get("/backup/generar", async (request, reply) => {
    if (!request.user.permisos.includes("configuracion.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar la configuracion" });
    }
    const { empresaId } = request.user;
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) return reply.code(500).send({ error: "DATABASE_URL no esta configurada" });
    const bloqueo = await verificarBaseDeUnaSolaEmpresa();
    if (bloqueo) return reply.code(403).send({ error: bloqueo });

    const fecha = new Date().toISOString().slice(0, 10);
    reply.header("Content-Type", "application/sql");
    reply.header("Content-Disposition", `attachment; filename="backup-sistema-pos-${fecha}.sql"`);

    const proceso = spawn(PG_DUMP, ["--dbname", databaseUrl, "--format=plain", "--no-owner", "--no-privileges"]);
    let stderr = "";
    proceso.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proceso.on("error", (err) => {
      request.log.error(err);
    });
    proceso.on("close", (code) => {
      if (code !== 0) {
        request.log.error(`pg_dump termino con codigo ${code}: ${stderr}`);
      } else {
        registrarAuditoria({
          empresaId,
          usuarioId: request.user.usuarioId,
          accion: "GENERAR_BACKUP",
          entidad: "Backup",
        });
      }
    });

    return reply.send(proceso.stdout);
  });

  // Restaura un backup .sql previamente generado por este mismo endpoint.
  // DESTRUCTIVO: sobreescribe los datos actuales de la base. El cliente debe
  // pedir confirmacion explicita antes de llamar a esta ruta.
  app.post("/backup/restaurar", async (request, reply) => {
    if (!request.user.permisos.includes("configuracion.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar la configuracion" });
    }
    const { empresaId, usuarioId } = request.user;
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) return reply.code(500).send({ error: "DATABASE_URL no esta configurada" });

    // Si es BD compartida, pedir confirmación explícita
    const bloqueo = await verificarBaseDeUnaSolaEmpresa();
    if (bloqueo) {
      // Permitir restauración pero solo si se pasa el header de confirmación
      const confirmado = (request.headers["x-confirm-restore"] as string) === "true";
      if (!confirmado) {
        return reply.code(403).send({
          error: bloqueo,
          requiresConfirmation: true,
          mensaje: "Esta base de datos es compartida (multi-empresa). Para restaurar, debes confirmar explícitamente que entiendes los riesgos.",
        });
      }
      // Confirmación recibida, proceder con la restauración
      request.log.warn(`[RESTORE] BD compartida: usuario ${usuarioId} está restaurando backup - riesgo de pérdida de datos`);
    }

    const body = request.body as Buffer;
    if (!body || body.length === 0) {
      return reply.code(400).send({ error: "Falta el archivo de respaldo" });
    }

    const resultado = await new Promise<{ ok: boolean; mensaje: string }>((resolve) => {
      const proceso = spawn(PSQL, [databaseUrl]);
      let stderr = "";
      proceso.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      proceso.on("error", (err) => {
        resolve({ ok: false, mensaje: err.message });
      });
      proceso.on("close", (code) => {
        resolve({ ok: code === 0, mensaje: stderr });
      });
      proceso.stdin.write(body);
      proceso.stdin.end();
    });

    if (!resultado.ok) {
      request.log.error(`psql restore fallo: ${resultado.mensaje}`);
      return reply.code(502).send({ error: "No se pudo restaurar el respaldo. Revisa que el archivo sea valido." });
    }

    registrarAuditoria({
      empresaId,
      usuarioId,
      accion: "RESTAURAR_BACKUP",
      entidad: "Backup",
    });

    return { ok: true };
  });

  app.get("/backup/info", async (request, reply) => {
    if (!request.user.permisos.includes("configuracion.administrar")) {
      return reply.code(403).send({ error: "No tienes permiso para administrar la configuracion" });
    }
    const { empresaId } = request.user;
    const ultimoBackup = await prisma.registroAuditoria.findFirst({
      where: { empresaId, accion: "GENERAR_BACKUP" },
      orderBy: { fecha: "desc" },
    });
    return { ultimoBackup: ultimoBackup?.fecha ?? null };
  });
}
