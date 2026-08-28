import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();

async function main() {
  console.log("🧹 Limpiando planes antiguos...");

  // Eliminar todos los planes existentes
  const deleted = await prisma.precioPlan.deleteMany({});
  console.log(`✅ ${deleted.count} planes eliminados`);

  console.log("\n🌱 Creando los 4 planes comerciales...");

  const planes = [
    {
      tipoPlan: "TRIAL_5D",
      precio: new Decimal(4000),
      descuento: new Decimal(0),
      precioFinal: new Decimal(4000),
      diasDuracion: 5,
      precioXUsuarioAdicional: new Decimal(0),
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

  for (const plan of planes) {
    const created = await prisma.precioPlan.create({
      data: plan as any,
    });
    console.log(`  ✅ ${created.tipoPlan}: $${created.precioFinal} COP (${created.diasDuracion} días)`);
  }

  console.log(`\n✨ Listo: 4 planes creados exitosamente`);
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
