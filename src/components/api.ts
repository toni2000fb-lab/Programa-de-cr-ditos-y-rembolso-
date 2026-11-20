"use client";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string };
}

export async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as T & ErrorBody;
  if (!res.ok) {
    throw new ApiError(res.status, body.error?.code ?? "HTTP_ERROR", body.error?.message ?? `Error HTTP ${res.status}`);
  }
  return body;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Error inesperado";
}
