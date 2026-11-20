import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

// Sesión simulada: los route handlers leen la cookie con `cookies()` de next/headers.
const auth = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "session" && auth.token ? { name, value: auth.token } : undefined),
  }),
}));
// `after()` sólo existe dentro de una petición real de Next; aquí no se lanza la consulta de buró.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: () => undefined,
}));

process.env.SESSION_SECRET ??= "secreto-de-pruebas-suficientemente-largo";

import { GET as getAudit } from "@/app/api/audit/route";
import { GET as getAuditStream } from "@/app/api/audit/stream/route";
import { GET as getBudget } from "@/app/api/budget/route";
import { GET as listRequests, POST as createRequest } from "@/app/api/requests/route";
import { GET as getEligibility } from "@/app/api/requests/eligibility/route";
import { POST as approve } from "@/app/api/requests/[id]/approve/route";
import { POST as reject } from "@/app/api/requests/[id]/reject/route";
import { POST as review } from "@/app/api/requests/[id]/review/route";
import { POST as recheckBureau } from "@/app/api/requests/[id]/bureau/route";
import { createSessionToken } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { analista, db, requestInReview, seedActors, setBudget, solicitante, solicitante2, uniqueDoc } from "./helpers";

beforeAll(seedActors);
beforeEach(() => {
  auth.token = undefined;
  return setBudget(5_000_000);
});
afterAll(async () => {
  await prisma.$disconnect();
  await db.$disconnect();
});

const asUser = (actor?: { id: string }) => {
  auth.token = actor ? createSessionToken(actor.id) : undefined;
};
const get = (path: string) => new Request(`http://localhost${path}`);
const post = (path: string, body: unknown = {}, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

/** Todas las rutas protegidas, con el rol que las puede usar. */
const someId = randomUUID();
const protectedRoutes: { name: string; role: "ANALISTA" | "SOLICITANTE"; call: () => Promise<Response> }[] = [
  { name: "GET /api/budget", role: "ANALISTA", call: () => getBudget() },
  { name: "GET /api/audit", role: "ANALISTA", call: () => getAudit(get("/api/audit")) },
  { name: "GET /api/audit/stream", role: "ANALISTA", call: () => getAuditStream(get("/api/audit/stream")) },
  { name: "POST /api/requests/:id/review", role: "ANALISTA", call: () => review(post("/x"), ctx(someId)) },
  {
    name: "POST /api/requests/:id/approve",
    role: "ANALISTA",
    call: () => approve(post("/x", {}, { "Idempotency-Key": randomUUID() }), ctx(someId)),
  },
  {
    name: "POST /api/requests/:id/reject",
    role: "ANALISTA",
    call: () => reject(post("/x", { reason: "Motivo suficientemente largo" }, { "Idempotency-Key": randomUUID() }), ctx(someId)),
  },
  { name: "POST /api/requests/:id/bureau", role: "ANALISTA", call: () => recheckBureau(post("/x"), ctx(someId)) },
  { name: "POST /api/requests", role: "SOLICITANTE", call: () => createRequest(post("/api/requests", {})) },
  {
    name: "GET /api/requests/eligibility",
    role: "SOLICITANTE",
    call: () => getEligibility(get("/api/requests/eligibility?documentId=ABCDE12345")),
  },
  { name: "GET /api/requests", role: "SOLICITANTE", call: () => listRequests() },
];

describe("Control de acceso en el servidor (rutas HTTP)", () => {
  it("sin sesión todas las rutas protegidas responden 401", async () => {
    for (const route of protectedRoutes) {
      const res = await route.call();
      expect(res.status, route.name).toBe(401);
      expect(await errorCode(res), route.name).toBe("UNAUTHENTICATED");
    }
  });

  it("un solicitante recibe 403 en todas las rutas de analista", async () => {
    asUser(solicitante);
    for (const route of protectedRoutes.filter((r) => r.role === "ANALISTA")) {
      const res = await route.call();
      expect(res.status, route.name).toBe(403);
      expect(await errorCode(res), route.name).toBe("FORBIDDEN");
    }
  });

  it("un analista recibe 403 al crear solicitudes o consultar elegibilidad", async () => {
    asUser(analista);
    for (const route of protectedRoutes.filter((r) => r.role === "SOLICITANTE" && r.name !== "GET /api/requests")) {
      expect((await route.call()).status, route.name).toBe(403);
    }
  });

  it("una cookie manipulada para hacerse pasar por un analista no sirve (401)", async () => {
    const [, signature] = createSessionToken(solicitante.id).split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ uid: analista.id, exp: 9_999_999_999 })).toString("base64url");
    auth.token = `${forgedPayload}.${signature}`;
    expect((await getBudget()).status).toBe(401);
  });

  it("una sesión firmada de un usuario que no existe se rechaza (401)", async () => {
    asUser({ id: "usuario-inexistente" });
    expect((await getBudget()).status).toBe(401);
  });

  it("el analista sí accede al presupuesto y a la auditoría", async () => {
    asUser(analista);
    const budget = await getBudget();
    expect(budget.status).toBe(200);
    expect(((await budget.json()) as { availableCents: number }).availableCents).toBe(5_000_000);
    expect((await getAudit(get("/api/audit"))).status).toBe(200);
  });
});

describe("Visibilidad de solicitudes por HTTP", () => {
  it("un solicitante sólo ve las suyas; el analista las ve todas", async () => {
    asUser(solicitante);
    const created = await createRequest(
      post("/api/requests", {
        applicantName: "Cliente Rutas",
        documentId: uniqueDoc(),
        monthlyIncome: 3000,
        amount: 1000,
        termMonths: 12,
      }),
    );
    expect(created.status).toBe(201);
    const { request } = (await created.json()) as { request: { id: string } };

    const idsFor = async (actor: { id: string }) => {
      asUser(actor);
      const { requests } = (await (await listRequests()).json()) as { requests: { id: string }[] };
      return requests.map((r) => r.id);
    };
    expect(await idsFor(solicitante)).toContain(request.id);
    expect(await idsFor(solicitante2)).not.toContain(request.id);
    expect(await idsFor(analista)).toContain(request.id);
  });
});

describe("Aprobación por HTTP: idempotencia y conflictos", () => {
  it("exige Idempotency-Key y, al repetirla, devuelve la misma respuesta sin descontar dos veces", async () => {
    const id = await requestInReview(1_000);
    asUser(analista);

    const withoutKey = await approve(post(`/api/requests/${id}/approve`), ctx(id));
    expect(withoutKey.status).toBe(400);

    const key = randomUUID();
    const first = await approve(post(`/api/requests/${id}/approve`, {}, { "Idempotency-Key": key }), ctx(id));
    const second = await approve(post(`/api/requests/${id}/approve`, {}, { "Idempotency-Key": key }), ctx(id));
    expect(first.status).toBe(200);
    expect(first.headers.get("Idempotent-Replayed")).toBe("false");
    expect(second.status).toBe(200);
    expect(second.headers.get("Idempotent-Replayed")).toBe("true");
    expect(await second.json()).toEqual(await first.json());

    const budget = (await (await getBudget()).json()) as { availableCents: number };
    expect(budget.availableCents).toBe(5_000_000 - 100_000);
  });

  it("una segunda aprobación con otra clave responde 409 ALREADY_PROCESSED", async () => {
    const id = await requestInReview(500);
    asUser(analista);
    await approve(post(`/api/requests/${id}/approve`, {}, { "Idempotency-Key": randomUUID() }), ctx(id));

    const again = await approve(post(`/api/requests/${id}/approve`, {}, { "Idempotency-Key": randomUUID() }), ctx(id));
    expect(again.status).toBe(409);
    expect(await errorCode(again)).toBe("ALREADY_PROCESSED");
  });

  it("rechazar con un motivo de menos de 15 caracteres responde 400", async () => {
    const id = await requestInReview(500);
    asUser(analista);
    const res = await reject(post(`/api/requests/${id}/reject`, { reason: "corto" }, { "Idempotency-Key": randomUUID() }), ctx(id));
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe("VALIDATION");
  });
});
