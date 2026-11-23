import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/server/auth/session";
import { sessionCookieOptions } from "@/server/auth/cookie";

export async function POST(request: Request) {
  const res = NextResponse.json({ ok: true });
  // Mismos atributos que al iniciar sesión, para que el navegador reconozca la cookie que debe borrar.
  res.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(request, 0));
  return res;
}
