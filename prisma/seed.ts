import { PrismaClient } from "@prisma/client";
import { INITIAL_BUDGET_CENTS } from "../src/domain/rules";

const prisma = new PrismaClient();

export const TEST_USERS = [
  { id: "u-sol-ana", name: "Ana Torres", role: "SOLICITANTE" },
  { id: "u-sol-luis", name: "Luis Gómez", role: "SOLICITANTE" },
  { id: "u-ana-carla", name: "Carla Méndez", role: "ANALISTA" },
  { id: "u-ana-diego", name: "Diego Rojas", role: "ANALISTA" },
] as const;

async function main() {
  for (const u of TEST_USERS) {
    await prisma.user.upsert({ where: { id: u.id }, update: { name: u.name, role: u.role }, create: u });
  }
  // Sólo se crea si no existe: reiniciar el contenedor no restablece el presupuesto.
  await prisma.budget.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, initialCents: INITIAL_BUDGET_CENTS, availableCents: INITIAL_BUDGET_CENTS },
  });
  console.log(`Seed OK: ${TEST_USERS.length} usuarios de prueba y presupuesto global.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
