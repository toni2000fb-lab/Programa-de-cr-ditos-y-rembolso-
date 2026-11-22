import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { ROLE_HOME } from "@/domain/roles";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(ROLE_HOME[user.role]);
}
