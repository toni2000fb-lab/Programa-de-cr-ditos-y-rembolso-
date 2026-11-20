import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { handle, parseBody } from "@/server/http";
import { DomainError } from "@/domain/errors";
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/server/auth/session";

const schema = z.object({ userId: z.string().min(1).max(100) });

export async function POST(request: Request) {
  return handle(async () => {
    const { userId } = await parseBody(request, schema);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new DomainError("UNAUTHENTICATED", "Usuario de prueba no válido");
    const res = NextResponse.json({ user: { id: user.id, name: user.name, role: user.role } });
    res.cookies.set(SESSION_COOKIE, createSessionToken(user.id), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "true",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
    return res;
  });
}
