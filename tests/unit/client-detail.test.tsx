// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientDetail } from "@/components/ClientDetail";
import type { RequestDTO } from "@/components/types";
import type { RequestDetail } from "@/server/services/request-detail";

const ID = "11111111-1111-4111-8111-111111111111";

function dto(o: Partial<RequestDTO> = {}): RequestDTO {
  return {
    id: ID,
    applicantName: "Marta Cliente",
    documentId: "ABC12345",
    monthlyIncomeCents: 300_000,
    amountCents: 100_000,
    termMonths: 12,
    employmentTenure: "TRES_ANIOS_O_MAS",
    status: "EN_REVISION",
    rejectionReason: null,
    decidedAt: null,
    bureauStatus: "COMPLETADO",
    bureauScore: 712,
    bureauAttempts: 2,
    bureauCheckedAt: "2026-11-21T15:00:00.000Z",
    bureauError: null,
    createdById: "u-sol-ana",
    createdAt: "2026-11-21T14:00:00.000Z",
    updatedAt: new Date().toISOString(),
    urgent: false,
    ...o,
  } as RequestDTO;
}

function detail(o: Partial<RequestDetail> = {}): RequestDetail {
  return {
    request: dto(),
    createdBy: { id: "u-sol-ana", name: "Ana Torres", role: "SOLICITANTE" },
    history: [],
    audit: [
      { id: 1, requestId: ID, applicantName: "Marta Cliente", actorId: "u-sol-ana", actorName: "Ana Torres", actorRole: "SOLICITANTE", fromStatus: null, toStatus: "CREADA", comment: "Solicitud registrada", timestamp: "2026-11-21T14:00:00.000Z" },
      { id: 2, requestId: ID, applicantName: "Marta Cliente", actorId: "u-ana", actorName: "Carla Ruiz", actorRole: "ANALISTA", fromStatus: "CREADA", toStatus: "EN_REVISION", comment: null, timestamp: "2026-11-21T14:30:00.000Z" },
    ],
    availableBudgetCents: 5_000_000,
    ...o,
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let payload: RequestDetail;
let missing = false;
const posts: { url: string; body: { urgent?: boolean } }[] = [];

beforeEach(() => {
  payload = detail();
  missing = false;
  posts.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { urgent?: boolean };
        posts.push({ url, body });
        payload.request.urgent = body.urgent;
        return json({ request: payload.request });
      }
      return missing ? json({ error: { code: "NOT_FOUND", message: "Solicitud no encontrada" } }, 404) : json(payload);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderLoaded() {
  const view = render(<ClientDetail id={ID} />);
  await screen.findByRole("heading", { name: "Marta Cliente" });
  return view;
}

const card = (title: string) => screen.getByRole("heading", { name: title }).closest("section") as HTMLElement;

describe("Detalle del cliente", () => {
  it("reúne los datos del cliente, el crédito, la verificación y el buró", async () => {
    await renderLoaded();

    const client = within(card("Datos del cliente"));
    expect(client.getByText("ABC12345")).toBeTruthy();
    expect(client.getAllByText("3 años o más").length).toBeGreaterThan(0);
    expect(client.getByText("Alta")).toBeTruthy();
    expect(client.getByText("Q3,000.00")).toBeTruthy();
    expect(client.getByText("Ana Torres")).toBeTruthy();
    expect(client.getByText("(Asesor de crédito)")).toBeTruthy();

    const credit = within(card("Crédito solicitado"));
    expect(credit.getByText("Q1,000.00")).toBeTruthy();
    expect(credit.getByText("12 meses")).toBeTruthy();
    expect(credit.getByText(/33\.3 %/)).toBeTruthy();

    const checks = within(card("Verificación para aprobar"));
    expect(checks.getAllByRole("img", { name: "Cumple" })).toHaveLength(4);
    expect(checks.getByText("Consulta completada, puntaje 712")).toBeTruthy();

    const bureau = within(card("Buró de crédito"));
    expect(bureau.getByText("2")).toBeTruthy(); // intentos
  });

  it("avisa que cumple las condiciones y deja la decisión al analista", async () => {
    await renderLoaded();
    expect(screen.getByText(/Cumple las condiciones del sistema para aprobar/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Aprobar" })).toBeTruthy();
  });

  it("explica qué falta cuando todavía no se puede aprobar", async () => {
    payload = detail({ request: dto({ bureauStatus: "CONSULTANDO", bureauScore: null }) });
    await renderLoaded();
    expect(screen.getByText("Aún no se puede aprobar. Falta: Consulta al buró de crédito.")).toBeTruthy();
    expect(within(card("Verificación para aprobar")).getByRole("img", { name: "Pendiente" })).toBeTruthy();
  });

  it("muestra el presupuesto insuficiente como incumplimiento", async () => {
    payload = detail({ availableBudgetCents: 50_000 });
    await renderLoaded();
    expect(screen.getByText("Aún no se puede aprobar. Falta: Presupuesto disponible.")).toBeTruthy();
    expect(screen.getByText("Insuficiente: disponible Q500.00, solicita Q1,000.00")).toBeTruthy();
  });

  it("lista las otras solicitudes del mismo documento, con su motivo de rechazo", async () => {
    payload = detail({
      history: [
        { id: "22222222-2222-4222-8222-222222222222", status: "RECHAZADA", amountCents: 250_000, termMonths: 24, createdAt: "2026-09-01T10:00:00.000Z", decidedAt: "2026-09-02T10:00:00.000Z", rejectionReason: "Ingresos no verificables" },
        { id: "33333333-3333-4333-8333-333333333333", status: "APROBADA", amountCents: 80_000, termMonths: 6, createdAt: "2026-05-01T10:00:00.000Z", decidedAt: "2026-05-02T10:00:00.000Z", rejectionReason: null },
      ],
    });
    await renderLoaded();
    const history = within(card("Historial del cliente"));
    expect(history.getByText("Q2,500.00")).toBeTruthy();
    expect(history.getByText("Motivo: Ingresos no verificables")).toBeTruthy();
    expect(history.getByRole("link", { name: "Rechazada" }).getAttribute("href")).toBe(
      "/analista/solicitudes/22222222-2222-4222-8222-222222222222",
    );
    expect(history.getByRole("link", { name: "Aprobada" })).toBeTruthy();
  });

  it("indica cuando el documento no tiene otras solicitudes", async () => {
    await renderLoaded();
    expect(screen.getByText("Este documento no tiene otras solicitudes.")).toBeTruthy();
  });

  it("muestra el seguimiento en orden cronológico con quién hizo cada cosa", async () => {
    await renderLoaded();
    const items = within(card("Seguimiento")).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain("Creada");
    expect(items[0]!.textContent).toContain("Ana Torres (Asesor de crédito)");
    expect(items[0]!.textContent).toContain("Solicitud registrada");
    expect(items[1]!.textContent).toContain("Creada → En revisión");
    expect(items[1]!.textContent).toContain("Carla Ruiz (Analista)");
  });

  it("incluye la tabla de amortización", async () => {
    await renderLoaded();
    expect(screen.getByRole("heading", { name: "Simulación financiera" })).toBeTruthy();
  });

  it("una solicitud resuelta no muestra aviso de aprobación ni botones de decisión", async () => {
    payload = detail({ request: dto({ status: "RECHAZADA", rejectionReason: "Historial insuficiente para el monto" }) });
    await renderLoaded();
    expect(screen.queryByText(/Aún no se puede aprobar|Cumple las condiciones/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull();
    expect(screen.getByText("Motivo del rechazo: Historial insuficiente para el monto")).toBeTruthy();
  });

  it("se puede marcar urgente desde el detalle y la etiqueta aparece", async () => {
    await renderLoaded();
    expect(screen.queryByText("Urgente")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Marcar urgente" }));
    await waitFor(() => expect(screen.getByText("Urgente")).toBeTruthy());
    expect(posts).toEqual([{ url: `/api/requests/${ID}/urgent`, body: { urgent: true } }]);
    expect(screen.getByRole("button", { name: "Quitar urgente" })).toBeTruthy();
  });

  it("una solicitud que no existe lo dice y ofrece volver al panel", async () => {
    missing = true;
    render(<ClientDetail id={ID} />);
    expect(await screen.findByRole("heading", { name: "Solicitud no encontrada" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Volver al panel" }).getAttribute("href")).toBe("/analista");
  });
});
