import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { DomainError } from "@/domain/errors";

export function jsonError(error: DomainError): Response {
  return NextResponse.json(
    { error: { code: error.code, message: error.message, details: error.details ?? null } },
    { status: error.httpStatus },
  );
}

/** Traduce errores de dominio / validación a respuestas HTTP coherentes. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof DomainError) return jsonError(error);
    if (error instanceof ZodError) {
      return jsonError(
        new DomainError("VALIDATION", error.issues[0]?.message ?? "Datos inválidos", error.issues),
      );
    }
    console.error("[api] error no controlado", error);
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Error interno del servidor", details: null } },
      { status: 500 },
    );
  }
}

export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new DomainError("VALIDATION", "El cuerpo de la petición debe ser JSON válido");
  }
  return schema.parse(raw);
}
