import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { AsesorPanel } from "@/components/AsesorPanel";

export const dynamic = "force-dynamic";

export default async function AsesorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "SOLICITANTE") redirect("/analista");
  return <AsesorPanel />;
}
