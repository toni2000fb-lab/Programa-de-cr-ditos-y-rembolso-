import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { SolicitantePanel } from "@/components/SolicitantePanel";

export const dynamic = "force-dynamic";

export default async function SolicitantePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "SOLICITANTE") redirect("/analista");
  return <SolicitantePanel />;
}
