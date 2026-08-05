import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const PG_DUMP = process.env.PG_DUMP_PATH || "pg_dump";
const BACKUP_INTERVAL = 12 * 60 * 60 * 1000; // 12 horas

async function generarBackupAutomatico(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log("[AutoBackup] DATABASE_URL no configurada, saltando backup");
    return;
  }

  const carpetaBackups = join(homedir(), ".sistema-pos-backups");
  await mkdir(carpetaBackups, { recursive: true });

  const fecha = new Date().toISOString().replace(/:/g, "-").slice(0, 19);
  const archivo = join(carpetaBackups, `backup-automatico-${fecha}.sql`);

  console.log(`[AutoBackup] Generando backup en ${archivo}...`);

  try {
    const contenido = await new Promise<string>((resolve, reject) => {
      const proceso = spawn(PG_DUMP, [
        "--dbname",
        databaseUrl,
        "--format=plain",
        "--no-owner",
        "--no-privileges",
      ]);

      let stdout = "";
      let stderr = "";

      proceso.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      proceso.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      proceso.on("error", (err) => {
        reject(err);
      });

      proceso.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`pg_dump fallo con codigo ${code}: ${stderr}`));
        } else {
          resolve(stdout);
        }
      });
    });

    await writeFile(archivo, contenido);
    console.log(`[AutoBackup] ✅ Backup completado: ${archivo}`);
  } catch (err) {
    console.error(`[AutoBackup] ❌ Error al generar backup:`, err);
  }
}

export function iniciarBackupAutomatico(): void {
  if (!process.env.DATABASE_URL) {
    console.log("[AutoBackup] DATABASE_URL no configurada, deshabilitando backups automáticos");
    return;
  }

  console.log("[AutoBackup] Inicializando backups automáticos cada 12 horas");
  console.log("[AutoBackup] Nota: pg_dump debe estar en el PATH del sistema para que funcionen los backups");

  generarBackupAutomatico().catch((err) => {
    console.warn("[AutoBackup] No se puede generar backups (pg_dump no disponible). El sistema seguirá funcionando.", err.message);
  });

  setInterval(() => {
    generarBackupAutomatico().catch(() => {
      // Silenciar errores en intentos posteriores
    });
  }, BACKUP_INTERVAL);
}
