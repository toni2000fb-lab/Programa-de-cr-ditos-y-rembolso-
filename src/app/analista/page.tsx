import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { AnalystDashboard } from "@/components/AnalystDashboard";

export const dynamic = "force-dynamic";

export default async function AnalistaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ANALISTA") redirect("/asesor");
  return <AnalystDashboard />;
}
