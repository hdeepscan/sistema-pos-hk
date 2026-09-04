import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Creando planes comerciales...");

  // Verificar si ya existen planes
  const planesExistentes = await prisma.precioPlan.findMany();

  if (planesExistentes.length > 0) {
    console.log(`ℹ️ Los planes ya existen (${planesExistentes.length} encontrados)`);
    planesExistentes.forEach((p) => {
      console.log(`  - ${p.tipoPlan}: $${p.precioFinal} COP (${p.diasDuracion} días)`);
    });
    return;
  }

  // Crear los 4 planes comerciales
  const planes = [
    {
      tipoPlan: "TRIAL_5D",
      precio: new Decimal(4000),
      descuento: new Decimal(0),
      precioFinal: new Decimal(4000),
      diasDuracion: 5,
      precioXUsuarioAdicional: new Decimal(0), // Trial sin usuarios adicionales
      activo: true,
    },
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

  console.log("📝 Insertando planes...");

  for (const plan of planes) {
    const created = await prisma.precioPlan.create({
      data: plan as any,
    });
    console.log(`  ✅ ${created.tipoPlan}: $${created.precioFinal} COP (${created.diasDuracion} días)`);
  }

  console.log(`\n✅ ${planes.length} planes creados exitosamente`);
}

main()
  .catch((e) => {
    console.error("❌ Error ejecutando seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
