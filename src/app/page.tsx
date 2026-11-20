import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(user.role === "ANALISTA" ? "/analista" : "/solicitante");
}
