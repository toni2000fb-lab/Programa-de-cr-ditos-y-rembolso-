"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, errorMessage } from "./api";

interface TestUser {
  id: string;
  name: string;
  role: "SOLICITANTE" | "ANALISTA";
}

export function LoginForm({ users }: { users: TestUser[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function login(u: TestUser) {
    setPending(u.id);
    setError(null);
    try {
      await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ userId: u.id }) });
      router.replace(u.role === "ANALISTA" ? "/analista" : "/solicitante");
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
      setPending(null);
    }
  }

  return (
    <div className="users">
      {users.map((u) => (
        <button key={u.id} className="user-card" onClick={() => login(u)} disabled={pending !== null}>
          <strong>{u.name}</strong>
          <span className={`role role-${u.role.toLowerCase()}`}>{u.role === "ANALISTA" ? "Analista" : "Solicitante"}</span>
          {pending === u.id && <span className="muted">Entrando…</span>}
        </button>
      ))}
      {error && <p className="alert error">{error}</p>}
    </div>
  );
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="link"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.replace("/login");
        router.refresh();
      }}
    >
      Cerrar sesión
    </button>
  );
}
