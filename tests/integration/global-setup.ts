import { execSync } from "node:child_process";

/** Aplica las migraciones a la BD de pruebas antes de ejecutar los tests de integración. */
export default function setup() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL debe apuntar a la base de datos de pruebas");
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
}
