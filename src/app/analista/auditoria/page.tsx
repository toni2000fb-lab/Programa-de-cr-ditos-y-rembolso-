import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { AuditPanel } from "@/components/AuditPanel";

export const dynamic = "force-dynamic";

export default async function AuditoriaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ANALISTA") redirect("/solicitante");
  return <AuditPanel />;
}
