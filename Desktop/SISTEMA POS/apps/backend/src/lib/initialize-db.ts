import { prisma } from "./prisma.js";

/**
 * Inicializa la base de datos ejecutando migraciones de Prisma.
 * Si las tablas ya existen, no hace nada.
 * Si fallan las migraciones, continúa de todas formas.
 */
export async function initializeDatabase(): Promise<void> {
  try {
    console.log("[DB Init] Verificando esquema de base de datos...");

    // Verificar si la tabla 'empresa' existe (tabla base)
    const result = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'empresa'
      )
    ` as Array<{ exists: boolean }>;

    if (result[0]?.exists) {
      console.log("[DB Init] ✅ Base de datos ya inicializada");
      return;
    }

    console.log("[DB Init] ⏳ Ejecutando migraciones de Prisma...");

    // Ejecutar migraciones
    const { execSync } = await import("child_process");
    try {
      execSync("npx prisma migrate deploy", {
        cwd: process.cwd(),
        stdio: "inherit",
      });
      console.log("[DB Init] ✅ Migraciones completadas");
    } catch (err) {
      console.warn("[DB Init] ⚠️  No se pudieron ejecutar las migraciones automáticamente");
      console.warn("[DB Init] Intentando continuar de todas formas...");
    }
  } catch (err) {
    console.error("[DB Init] Error:", (err as Error).message);
    console.warn("[DB Init] Continuando de todas formas...");
  }
}
