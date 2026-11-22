import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { ROLE_HOME } from "@/domain/roles";
import { ClientDetail } from "@/components/ClientDetail";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ANALISTA") redirect(ROLE_HOME[user.role]);
  const { id } = await params;
  return <ClientDetail id={id} />;
}
