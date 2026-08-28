import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Iniciando seed de planes de pago...");

  // Verificar si ya existen planes
  const planesExistentes = await prisma.precioPlan.findMany();

  if (planesExistentes.length > 0) {
    console.log(`ℹ️ Ya existen ${planesExistentes.length} planes en la BD`);
    console.log("Planes encontrados:");
    planesExistentes.forEach((plan) => {
      console.log(
        `  - ${plan.tipoPlan}: $${plan.precioFinal} COP (${plan.diasDuracion} días)`
      );
    });
    return;
  }

  // Crear planes de producción
  const planes = [
    {
      tipoPlan: "MENSUAL",
      precio: new Decimal(40000),
      descuento: new Decimal(0),
      precioFinal: new Decimal(40000),
      diasDuracion: 30,
      precioXUsuarioAdicional: new Decimal(5000),
      activo: true,
    },
    {
      tipoPlan: "TRIMESTRAL",
      precio: new Decimal(110000),
      descuento: new Decimal(0),
      precioFinal: new Decimal(110000),
      diasDuracion: 90,
      precioXUsuarioAdicional: new Decimal(5000),
      activo: true,
    },
    {
      tipoPlan: "ANUAL",
      precio: new Decimal(360000),
      descuento: new Decimal(0),
      precioFinal: new Decimal(360000),
      diasDuracion: 365,
      precioXUsuarioAdicional: new Decimal(5000),
      activo: true,
    },
  ];

  for (const plan of planes) {
    const created = await prisma.precioPlan.create({
      data: plan as any,
    });
    console.log(`✅ Plan creado: ${created.tipoPlan} - $${created.precioFinal} COP`);
  }

  console.log("✅ Seed completado");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
