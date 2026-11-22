import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser } from "@/server/auth/current-user";
import { LogoutButton } from "@/components/LoginForm";
import { ROLE_LABEL } from "@/domain/roles";

export const metadata: Metadata = {
  title: "Créditos y Desembolsos",
  description: "Sistema de aprobación de créditos y desembolsos",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="es">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            Créditos<span>&amp;</span>Desembolsos
          </Link>
          {user && (
            <nav>
              {user.role === "ANALISTA" ? (
                <>
                  <Link href="/analista">Panel</Link>
                  <Link href="/analista/auditoria">Auditoría</Link>
                </>
              ) : (
                <Link href="/asesor">Mis solicitudes</Link>
              )}
              <span className="who">
                {user.name} · <em>{ROLE_LABEL[user.role]}</em>
              </span>
              <LogoutButton />
            </nav>
          )}
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
