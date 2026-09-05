import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const SUPER_ADMIN_EMAIL = "hnieto@deepscan.com.co";
  const SUPER_ADMIN_PASSWORD = "SuperAdmin@2024!HK";

  try {
    // Verificar si ya existe
    const existente = await prisma.usuario.findUnique({
      where: { email: SUPER_ADMIN_EMAIL },
    });

    if (existente) {
      console.log(`✅ Super Admin ya existe: ${SUPER_ADMIN_EMAIL}`);
      return;
    }

    // Crear empresa "Sistema POS" si no existe
    let empresa = await prisma.empresa.findFirst({
      where: { nombre: "Sistema POS" },
    });

    if (!empresa) {
      empresa = await prisma.empresa.create({
        data: {
          nombre: "Sistema POS",
          plan: "ENTERPRISE",
          activo: true,
          estado: "activa",
          tipo_licencia: "ANUAL",
          dias_restantes: 999,
          fechaVencimiento: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
      });
      console.log(`📦 Empresa creada: ${empresa.nombre}`);
    }

    // Generar hash de contraseña
    const passwordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10);

    // Crear Super Admin
    const superAdmin = await prisma.usuario.create({
      data: {
        email: SUPER_ADMIN_EMAIL,
        nombre: "Super Admin",
        passwordHash,
        empresaId: empresa.id,
        rol: "ADMIN",
        es_super_admin: true,
        activo: true,
      },
    });

    console.log(`\n✅ SUPER ADMIN CREADO EXITOSAMENTE`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Email:    ${superAdmin.email}`);
    console.log(`Password: ${SUPER_ADMIN_PASSWORD}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  } catch (error) {
    console.error("Error creando Super Admin:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
