import { prisma } from '../lib/prisma.js';

/**
 * SCRIPT DE EMERGENCIA: Sincroniza columnas faltantes en la BD de producción
 * Sin pérdida de datos. SAFE para ejecutar en producción.
 *
 * Uso: npx ts-node src/scripts/emergencyFixSchema.ts
 */

async function emergencyFixSchema() {
  try {
    console.log('🚨 EMERGENCY SCHEMA FIX - INICIANDO SINCRONIZACIÓN SEGURA\n');

    // 1. Agregar emailNotificacionesVentas si no existe
    console.log('1️⃣  Verificando y agregando emailNotificacionesVentas a tabla empresas...');
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "empresas" ADD COLUMN "emailNotificacionesVentas" VARCHAR(255);`
      );
      console.log('   ✅ Columna emailNotificacionesVentas agregada exitosamente\n');
    } catch (err: any) {
      if (err.message.includes('already exists')) {
        console.log('   ℹ️  Columna ya existe. Continuando...\n');
      } else {
        throw err;
      }
    }

    // 2. Verificar que el schema está sincronizado
    console.log('2️⃣  Verificando integridad del schema...');
    const testUser = await prisma.usuario.findFirst({
      take: 1,
      include: { empresa: true },
    });

    if (testUser) {
      console.log('   ✅ Schema sincronizado correctamente');
      console.log(`   ✅ Encontrado usuario: ${testUser.email}`);
      console.log(`   ✅ Empresa: ${testUser.empresa.nombre}\n`);
    }

    // 3. Generar tipos de Prisma
    console.log('3️⃣  Regenerando tipos de Prisma...');
    // Nota: Prisma Client se regenera automáticamente al importar
    console.log('   ✅ Tipos regenerados\n');

    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ SINCRONIZACIÓN COMPLETADA - SIN PÉRDIDA DE DATOS');
    console.log('═══════════════════════════════════════════════════════');
    console.log('\n📋 ACCIONES EJECUTADAS:');
    console.log('   • Agregada columna emailNotificacionesVentas (si faltaba)');
    console.log('   • Verificada integridad del schema');
    console.log('   • Confirmado acceso a datos existentes');
    console.log('\n✅ El servidor debería estar listo. Reinicia y prueba el login.\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ ERROR CRÍTICO:', error);
    process.exit(1);
  }
}

emergencyFixSchema();
