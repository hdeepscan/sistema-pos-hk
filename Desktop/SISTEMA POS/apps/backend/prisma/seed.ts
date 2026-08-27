import { PrismaClient, TipoPlan } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Iniciando seed de datos...\n");

  // ========== CREAR PLANES DE PRECIOS ==========
  console.log("📊 Creando planes de precios...");

  const planes = [
    {
      tipoPlan: "MENSUAL" as TipoPlan,
      precio: 40000,
      descuento: 0,
      precioFinal: 40000,
      diasDuracion: 30,
      precioXUsuarioAdicional: 5000,
    },
    {
      tipoPlan: "TRIMESTRAL" as TipoPlan,
      precio: 120000,
      descuento: 10000,
      precioFinal: 110000,
      diasDuracion: 90,
      precioXUsuarioAdicional: 5000,
    },
    {
      tipoPlan: "ANUAL" as TipoPlan,
      precio: 480000,
      descuento: 120000,
      precioFinal: 360000,
      diasDuracion: 365,
      precioXUsuarioAdicional: 5000,
    },
  ];

  for (const plan of planes) {
    const existente = await prisma.precioPlan.findUnique({
      where: { tipoPlan: plan.tipoPlan },
    });

    if (!existente) {
      await prisma.precioPlan.create({
        data: plan,
      });
      console.log(`  ✓ Plan ${plan.tipoPlan} creado: $${plan.precioFinal.toLocaleString("es-CO")}`);
    } else {
      console.log(`  ⊝ Plan ${plan.tipoPlan} ya existe`);
    }
  }

  console.log("\n✅ Seed completado!\n");
  console.log("📌 Información:");
  console.log("  - Planes de precios creados");
  console.log("  - Próximo paso: Crear licencias para empresas existentes\n");
}

main()
  .catch((e) => {
    console.error("❌ Error en seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
