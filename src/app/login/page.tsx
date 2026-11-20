import { prisma } from "@/server/db";
import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const users = await prisma.user.findMany({ orderBy: [{ role: "desc" }, { name: "asc" }] });
  return (
    <div className="login">
      <h1>Selecciona un usuario de prueba</h1>
      <p className="muted">
        Entorno de demostración: la sesión se firma en el servidor y los permisos se verifican en cada petición.
      </p>
      <LoginForm users={users.map((u) => ({ id: u.id, name: u.name, role: u.role }))} />
    </div>
  );
}
