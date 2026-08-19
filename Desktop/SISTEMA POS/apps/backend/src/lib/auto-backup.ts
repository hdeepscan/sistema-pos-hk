import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";

const PG_DUMP = process.env.PG_DUMP_PATH || "pg_dump";
const BACKUP_INTERVAL = 12 * 60 * 60 * 1000; // 12 horas
let pg_dump_disponible = false;

// Verificar disponibilidad de pg_dump al iniciar
function verificarPgDumpDisponible(): boolean {
  try {
    execSync("which pg_dump", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function generarBackupAutomatico(): Promise<void> {
  // Si pg_dump no está disponible, saltar silenciosamente
  if (!pg_dump_disponible) {
    return;
  }

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
          reject(new Error(`pg_dump fallo con codigo ${code}`));
        } else {
          resolve(stdout);
        }
      });

      // Timeout: si tarda más de 5 minutos, matar el proceso
      setTimeout(() => {
        proceso.kill();
        reject(new Error("pg_dump timeout (>5min)"));
      }, 5 * 60 * 1000);
    });

    await writeFile(archivo, contenido);
    console.log(`[AutoBackup] ✅ Backup completado: ${archivo}`);
  } catch (err) {
    console.error(`[AutoBackup] ❌ Error al generar backup:`, (err as Error).message);
  }
}

export function iniciarBackupAutomatico(): void {
  if (!process.env.DATABASE_URL) {
    console.log("[AutoBackup] DATABASE_URL no configurada, deshabilitando backups automáticos");
    return;
  }

  pg_dump_disponible = verificarPgDumpDisponible();

  if (!pg_dump_disponible) {
    console.warn("[AutoBackup] ⚠️  pg_dump no disponible. Backups automáticos deshabilitados.");
    console.warn("[AutoBackup] Los backups manuales via API seguirán disponibles.");
    console.warn("[AutoBackup] En producción (Railway), usar los backups automáticos del servicio PostgreSQL.");
    return;
  }

  console.log("[AutoBackup] ✅ pg_dump disponible. Inicializando backups automáticos cada 12 horas");

  generarBackupAutomatico().catch((err) => {
    console.error("[AutoBackup] Error en primer backup:", (err as Error).message);
  });

  setInterval(() => {
    generarBackupAutomatico().catch((err) => {
      console.error("[AutoBackup] Error en backup programado:", (err as Error).message);
    });
  }, BACKUP_INTERVAL);
}
