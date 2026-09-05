import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  try {
    console.log("🔄 Creando usuario PODIUM ACCESSORIES...\n");

    // Hash de la contraseña
    const passwordHash = await bcrypt.hash("Podium1234*", 10);
    console.log("✓ Contraseña hasheada");

    // Calcular fecha de vencimiento (90 días desde hoy)
    const ahora = new Date();
    const fechaVencimiento = new Date(ahora.getTime() + 90 * 24 * 60 * 60 * 1000);

    // Crear todo en una transacción
    const resultado = await prisma.$transaction(async (tx) => {
      // 1. Crear empresa
      const empresa = await tx.empresa.create({
        data: {
          nombre: "PODIUM ACCESSORIES",
          activo: true,
          estado: "activa",
          tipo_licencia: "MENSUAL",
          dias_restantes: 90,
          fechaVencimiento: fechaVencimiento,
          bloqueada_por_admin: false,
        },
      });
      console.log(`✓ Empresa creada: ${empresa.id}`);

      // 2. Crear usuario
      const usuario = await tx.usuario.create({
        data: {
          empresaId: empresa.id,
          nombre: "JULIAN",
          email: "accessoriespodium@gmail.com",
          passwordHash: passwordHash,
          rol: "ADMIN",
          es_super_admin: false,
          activo: true,
        },
      });
      console.log(`✓ Usuario creado: ${usuario.id}`);

      // 3. Crear sucursal
      const sucursal = await tx.sucursal.create({
        data: {
          empresaId: empresa.id,
          nombre: "Principal",
          tipo: "FISICA",
          activo: true,
        },
      });
      console.log(`✓ Sucursal creada: ${sucursal.id}`);

      return { empresa, usuario, sucursal };
    });

    console.log("\n✅ ¡USUARIO CREADO EXITOSAMENTE!\n");
    console.log("📋 DATOS DE ACCESO:");
    console.log("═══════════════════════════════════════");
    console.log(`🏢 Empresa:    ${resultado.empresa.nombre}`);
    console.log(`👤 Usuario:    ${resultado.usuario.nombre}`);
    console.log(`📧 Email:      ${resultado.usuario.email}`);
    console.log(`🔐 Contraseña: Podium1234*`);
    console.log(`📅 Vencimiento: ${resultado.empresa.fechaVencimiento.toLocaleDateString("es-CO")}`);
    console.log(`⏳ Días restantes: ${resultado.empresa.dias_restantes}`);
    console.log("═══════════════════════════════════════");
    console.log(`🌐 Link: https://centrala.up.railway.app`);

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
