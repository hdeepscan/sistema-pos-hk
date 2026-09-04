import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔄 Migrando empresas existentes...");

  // Calcular fecha de vencimiento: hoy + 1 año (365 días)
  const fechaVencimiento = new Date();
  fechaVencimiento.setFullYear(fechaVencimiento.getFullYear() + 1);

  // Actualizar todas las empresas que NO tengan fechaVencimiento establecida
  const resultado = await prisma.empresa.updateMany({
    where: { fechaVencimiento: null },
    data: {
      fechaVencimiento,
      planSuscripcion: "ANUAL",
    },
  });

  console.log(`✅ ${resultado.count} empresas actualizadas con 1 año de suscripción`);
  console.log(`   Fecha de vencimiento: ${fechaVencimiento.toISOString().split("T")[0]}`);
}

main()
  .catch((e) => {
    console.error("❌ Error ejecutando seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
