import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
import { GET as getDetail } from "@/app/api/requests/[id]/route";
import { POST as approve } from "@/app/api/requests/[id]/approve/route";
import { POST as reject } from "@/app/api/requests/[id]/reject/route";
import { POST as review } from "@/app/api/requests/[id]/review/route";
import { POST as recheckBureau } from "@/app/api/requests/[id]/bureau/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { RATE_LIMITS, resetRateLimits } from "@/server/rate-limit";
import { createSessionToken } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { clientProfileInput } from "../fixtures";
import { analista, analista2, db, requestInReview, seedActors, setBudget, solicitante, solicitante2, uniqueDoc } from "./helpers";

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
  { name: "GET /api/requests/:id", role: "ANALISTA", call: () => getDetail(get("/x"), ctx(someId)) },
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
        employmentTenure: "DE_1_A_3_ANIOS",
        monthlyIncome: 3000,
        amount: 1000,
        termMonths: 12,
        ...clientProfileInput(),
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

describe("Asesor que registró cada solicitud", () => {
  type Listed = { id: string; createdByName?: string };

  it("el listado del analista indica qué asesor hizo cada solicitud", async () => {
    const mine = await requestInReview(1_000);
    asUser(analista);
    const listed = ((await (await listRequests()).json()) as { requests: Listed[] }).requests;
    expect(listed.find((r) => r.id === mine)?.createdByName).toBe(solicitante.name);
  });

  it("cada asesor ve solo las suyas, con su propio nombre", async () => {
    const mine = await requestInReview(1_000);
    asUser(solicitante2);
    const listed = ((await (await listRequests()).json()) as { requests: Listed[] }).requests;
    expect(listed.find((r) => r.id === mine)).toBeUndefined();
    for (const r of listed) expect(r.createdByName).toBe(solicitante2.name);
  });
});

describe("Antigüedad laboral al crear la solicitud", () => {
  const body = (extra: Record<string, unknown> = {}) => ({
    applicantName: "Cliente Antigüedad",
    documentId: uniqueDoc(),
    employmentTenure: "TRES_ANIOS_O_MAS",
    monthlyIncome: 3000,
    amount: 1000,
    termMonths: 12,
    ...clientProfileInput(),
    ...extra,
  });

  it("se guarda y se devuelve la antigüedad declarada", async () => {
    asUser(solicitante);
    const res = await createRequest(post("/api/requests", body()));
    expect(res.status).toBe(201);
    const { request } = (await res.json()) as { request: { id: string; employmentTenure: string } };
    expect(request.employmentTenure).toBe("TRES_ANIOS_O_MAS");
    expect((await db.creditRequest.findUniqueOrThrow({ where: { id: request.id } })).employmentTenure).toBe(
      "TRES_ANIOS_O_MAS",
    );
  });

  it("sin antigüedad o con un valor que no existe responde 400", async () => {
    asUser(solicitante);
    const { employmentTenure: _omit, ...without } = body();
    void _omit;
    for (const payload of [without, body({ employmentTenure: "MUCHO" }), body({ employmentTenure: null })]) {
      const res = await createRequest(post("/api/requests", payload));
      expect(res.status, JSON.stringify(payload)).toBe(400);
      expect(await errorCode(res)).toBe("VALIDATION");
    }
  });

  it("una solicitud anterior sin este dato se lista con la antigüedad en nulo", async () => {
    const legacy = await db.creditRequest.create({
      data: {
        applicantName: "Cliente Anterior",
        documentId: uniqueDoc(),
        monthlyIncomeCents: 300_000,
        amountCents: 100_000,
        termMonths: 12,
        createdById: solicitante.id,
      },
    });
    asUser(analista);
    const { requests } = (await (await listRequests()).json()) as {
      requests: { id: string; employmentTenure: string | null }[];
    };
    expect(requests.find((r) => r.id === legacy.id)?.employmentTenure).toBeNull();
  });
});

describe("Detalle del cliente por HTTP", () => {
  type Detail = {
    request: { id: string; applicantName: string; createdByName?: string };
    createdBy: { name: string; role: string };
    history: unknown[];
    audit: { toStatus: string }[];
    availableBudgetCents: number;
  };

  it("el analista recibe la solicitud, quién la registró, la auditoría y el presupuesto", async () => {
    const id = await requestInReview(1_000);
    await setBudget(1_234_500);
    asUser(analista);
    const res = await getDetail(get(`/api/requests/${id}`), ctx(id));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Detail;
    expect(body.request.id).toBe(id);
    expect(body.request.createdByName).toBe(solicitante.name);
    expect(body.createdBy).toMatchObject({ name: solicitante.name, role: "SOLICITANTE" });
    expect(body.availableBudgetCents).toBe(1_234_500);
    expect(body.audit.map((a) => a.toStatus)).toEqual(["CREADA", "EN_REVISION"]);
  });

  it("un asesor de crédito recibe 403 aunque la solicitud sea suya", async () => {
    const id = await requestInReview(1_000);
    asUser(solicitante);
    expect((await getDetail(get(`/api/requests/${id}`), ctx(id))).status).toBe(403);
  });

  it("un identificador inexistente o mal formado responde 404", async () => {
    asUser(analista);
    for (const id of [randomUUID(), "no-es-un-uuid"]) {
      const res = await getDetail(get(`/api/requests/${id}`), ctx(id));
      expect(res.status, id).toBe(404);
      expect(await errorCode(res)).toBe("NOT_FOUND");
    }
  });
});

describe("Datos obligatorios del cliente al crear la solicitud", () => {
  const body = (extra: Record<string, unknown> = {}) => ({
    applicantName: "Cliente Datos",
    documentId: uniqueDoc(),
    employmentTenure: "TRES_ANIOS_O_MAS",
    monthlyIncome: 3000,
    amount: 1000,
    termMonths: 12,
    ...clientProfileInput(),
    ...extra,
  });

  it("se guardan junto con la solicitud, con importes en centavos y teléfonos normalizados", async () => {
    asUser(solicitante);
    const res = await createRequest(
      post(
        "/api/requests",
        body({ phone: "+502 5555-1234", otherIncome: 250.5, monthlyExpenses: 1200.25, currentDebtPayment: 300, incomeType: "NEGOCIO_PROPIO" }),
      ),
    );
    expect(res.status).toBe(201);
    const { request } = (await res.json()) as { request: { id: string } };
    const profile = await db.clientProfile.findUniqueOrThrow({ where: { requestId: request.id } });
    expect(profile).toMatchObject({
      phone: "55551234",
      incomeType: "NEGOCIO_PROPIO",
      otherIncomeCents: 25_050,
      monthlyExpensesCents: 120_025,
      currentDebtPaymentCents: 30_000,
      reference1Phone: "55550001",
      receivedDocuments: ["COPIA_DPI", "COMPROBANTE_DOMICILIO", "CONSTANCIA_LABORAL", "COMPROBANTE_INGRESOS"],
    });
    expect(profile.birthDate.toISOString().slice(0, 10)).toBe("1990-05-10");
  });

  it("sin cualquiera de los datos obligatorios responde 400 y no crea nada", async () => {
    asUser(solicitante);
    const doc = uniqueDoc();
    for (const field of ["birthDate", "phone", "address", "employerName", "incomeType", "purpose", "reference2Phone", "receivedDocuments"]) {
      const payload = body({ documentId: doc }) as Record<string, unknown>;
      delete payload[field];
      const res = await createRequest(post("/api/requests", payload));
      expect(res.status, field).toBe(400);
      expect(await errorCode(res)).toBe("VALIDATION");
    }
    expect(await db.creditRequest.count({ where: { documentId: doc } })).toBe(0);
  });

  it("rechaza un cliente menor de edad, documentos incompletos y referencias repetidas", async () => {
    asUser(solicitante);
    const tooYoung = new Date();
    tooYoung.setUTCFullYear(tooYoung.getUTCFullYear() - 17);
    const bad: Record<string, unknown>[] = [
      { birthDate: tooYoung.toISOString().slice(0, 10) },
      { receivedDocuments: ["COPIA_DPI", "CONSTANCIA_LABORAL"] },
      { reference2Phone: "5555 0001" },
      { reference1Phone: "5555-1234" },
      { monthlyExpenses: -1 },
      { phone: "555" },
    ];
    for (const extra of bad) {
      const res = await createRequest(post("/api/requests", body(extra)));
      expect(res.status, JSON.stringify(extra)).toBe(400);
    }
  });

  it("si la solicitud se bloquea por el historial no queda ningún perfil huérfano", async () => {
    asUser(solicitante);
    const doc = uniqueDoc();
    expect((await createRequest(post("/api/requests", body({ documentId: doc })))).status).toBe(201);
    const before = await db.clientProfile.count();
    const again = await createRequest(post("/api/requests", body({ documentId: doc })));
    expect(again.status).toBe(409);
    expect(await db.clientProfile.count()).toBe(before);
  });

  it("el analista recibe los datos del cliente en el detalle y el asesor no puede pedirlos", async () => {
    asUser(solicitante);
    const created = await createRequest(post("/api/requests", body()));
    const { request } = (await created.json()) as { request: { id: string } };

    asUser(analista);
    const res = await getDetail(get(`/api/requests/${request.id}`), ctx(request.id));
    expect(res.status).toBe(200);
    const detail = (await res.json()) as { profile: { phone: string; references: unknown[]; receivedDocuments: string[] } };
    expect(detail.profile.phone).toBe("55551234");
    expect(detail.profile.references).toHaveLength(2);
    expect(detail.profile.receivedDocuments).toHaveLength(4);

    asUser(solicitante);
    expect((await getDetail(get(`/api/requests/${request.id}`), ctx(request.id))).status).toBe(403);
  });

  it("el listado de solicitudes no filtra los datos personales del cliente", async () => {
    asUser(solicitante);
    const created = await createRequest(post("/api/requests", body()));
    const { request } = (await created.json()) as { request: Record<string, unknown> };
    for (const field of ["phone", "address", "birthDate", "references", "receivedDocuments", "profile"]) {
      expect(request, field).not.toHaveProperty(field);
    }
    asUser(analista);
    const { requests } = (await (await listRequests()).json()) as { requests: Record<string, unknown>[] };
    for (const r of requests) expect(r).not.toHaveProperty("profile");
  });
});

describe("Restricciones de la tabla de datos del cliente", () => {
  it("la base de datos rechaza importes negativos aunque se salte la API", async () => {
    const id = await requestInReview(1_000);
    await expect(
      db.$executeRaw`UPDATE client_profiles SET monthly_expenses_cents = -1 WHERE request_id = ${id}::uuid`,
    ).rejects.toThrow(/client_profiles_money_non_negative|check constraint/i);
  });

  it("ya no existe la columna de urgente en las solicitudes", async () => {
    const columns = await db.$queryRaw<{ column_name: string }[]>`
      SELECT column_name::text AS column_name FROM information_schema.columns WHERE table_name = 'credit_requests'`;
    expect(columns.map((c) => c.column_name)).not.toContain("urgent");
  });
});


describe("Inicio y cierre de sesión por HTTP", () => {
  const loginAs = (userId: string, headers: Record<string, string> = {}) =>
    login(post("/api/auth/login", { userId }, headers));

  beforeEach(resetRateLimits);
  afterEach(() => vi.unstubAllEnvs());

  it("inicia sesión y deja una cookie httpOnly SameSite=Lax sin Secure por HTTP", async () => {
    const res = await loginAs(solicitante.id);
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).not.toMatch(/;\s*Secure/i);
  });

  it("en producción por HTTPS la cookie lleva Secure sin configurar COOKIE_SECURE", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await login(post("/api/auth/login", { userId: solicitante.id }, { "x-forwarded-proto": "https" }));
    expect(res.headers.get("set-cookie")).toMatch(/;\s*Secure/i);
  });

  it("en producción por HTTP (Docker en localhost) el login sigue funcionando sin Secure", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await loginAs(analista.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).not.toMatch(/;\s*Secure/i);
  });

  it("un usuario que no existe recibe 401", async () => {
    const res = await loginAs("no-existe");
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("el cierre de sesión borra la cookie con los mismos atributos", async () => {
    const res = await logout(post("/api/auth/logout"));
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^session=;/);
    expect(cookie).toMatch(/Max-Age=0/i);
    expect(cookie).toMatch(/HttpOnly/i);
  });
});

describe("Límite de peticiones por HTTP", () => {
  beforeEach(resetRateLimits);
  afterEach(() => vi.unstubAllEnvs());

  it("el inicio de sesión responde 429 con Retry-After al pasar del límite por IP", async () => {
    const headers = { "x-forwarded-for": "203.0.113.50" };
    for (let i = 0; i < RATE_LIMITS.login.limit; i++) {
      expect((await login(post("/api/auth/login", { userId: "no-existe" }, headers))).status).toBe(401);
    }
    const blocked = await login(post("/api/auth/login", { userId: solicitante.id }, headers));
    expect(blocked.status).toBe(429);
    expect(await errorCode(blocked)).toBe("RATE_LIMITED");
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(blocked.headers.get("set-cookie")).toBeNull();
  });

  it("el límite de una IP no afecta a otra", async () => {
    for (let i = 0; i <= RATE_LIMITS.login.limit; i++) {
      await login(post("/api/auth/login", { userId: "no-existe" }, { "x-forwarded-for": "203.0.113.51" }));
    }
    const other = await login(post("/api/auth/login", { userId: solicitante.id }, { "x-forwarded-for": "203.0.113.52" }));
    expect(other.status).toBe(200);
  });

  it("aprobar y rechazar comparten el límite por analista, y otro analista no se ve afectado", async () => {
    asUser(analista);
    const key = () => ({ "Idempotency-Key": randomUUID() });
    const limit = RATE_LIMITS.decision.limit;
    for (let i = 0; i < limit; i++) {
      const call = i % 2 === 0 ? approve : reject;
      const res = await call(post("/x", { reason: "Motivo suficientemente largo" }, key()), ctx(randomUUID()));
      expect(res.status).toBe(404); // la solicitud no existe, pero la petición cuenta
    }
    const blocked = await approve(post("/x", {}, key()), ctx(randomUUID()));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).not.toBeNull();

    asUser(analista2);
    expect((await approve(post("/x", {}, key()), ctx(randomUUID()))).status).toBe(404);
  });

  it("las peticiones sin permiso no gastan el límite del analista", async () => {
    asUser(solicitante); // 403 antes de contar
    for (let i = 0; i < RATE_LIMITS.decision.limit + 5; i++) {
      const res = await approve(post("/x", {}, { "Idempotency-Key": randomUUID() }), ctx(randomUUID()));
      expect(res.status).toBe(403);
    }
  });

  it("con RATE_LIMIT_DISABLED=true no se limita nada", async () => {
    vi.stubEnv("RATE_LIMIT_DISABLED", "true");
    const headers = { "x-forwarded-for": "203.0.113.60" };
    for (let i = 0; i < RATE_LIMITS.login.limit + 5; i++) {
      expect((await login(post("/api/auth/login", { userId: "no-existe" }, headers))).status).toBe(401);
    }
  });
});
