// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalystDashboard } from "@/components/AnalystDashboard";
import type { RequestDTO } from "@/components/types";

function dto(id: string, o: Partial<RequestDTO>): RequestDTO {
  return {
    id,
    applicantName: "Persona",
    documentId: "0000000000000",
    monthlyIncomeCents: 1_000_000,
    amountCents: 100_000,
    termMonths: 12,
    status: "CREADA",
    rejectionReason: null,
    decidedAt: null,
    bureauStatus: "COMPLETADO",
    bureauScore: 700,
    bureauAttempts: 1,
    bureauCheckedAt: null,
    bureauError: null,
    createdById: "u1",
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-01T10:00:00.000Z",
    ...o,
  } as RequestDTO;
}

const requests: RequestDTO[] = [
  dto("r1", { applicantName: "Ana López", amountCents: 500_000, createdAt: "2026-11-03T09:00:00.000Z", status: "APROBADA" }),
  dto("r2", { applicantName: "Bruno Pérez", amountCents: 150_000, createdAt: "2026-11-01T09:00:00.000Z", status: "EN_REVISION" }),
  dto("r3", { applicantName: "Álvaro Zúñiga", amountCents: 900_000, createdAt: "2026-11-02T09:00:00.000Z", status: "CREADA" }),
  dto("r4", { applicantName: "Carla Díaz", amountCents: 250_000, createdAt: "2026-11-04T09:00:00.000Z", status: "RECHAZADA", rejectionReason: "Historial insuficiente" }),
  dto("r5", { applicantName: "Diego Pérez", amountCents: 300_000, createdAt: "2026-11-05T09:00:00.000Z", status: "APROBADA" }),
];

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.startsWith("/api/budget")
        ? json({ initialCents: 5_000_000, availableCents: 4_200_000, committedCents: 800_000, updatedAt: "2026-11-05T09:00:00.000Z" })
        : json({ requests }),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Nombres de la columna "Solicitante", en el orden en que se ven. */
const names = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("tbody tr td:nth-child(2)")).map((td) => td.textContent);

async function renderLoaded() {
  const view = render(<AnalystDashboard />);
  await screen.findByText("Ana López");
  return view;
}

const card = (label: string) => screen.getByRole("button", { name: new RegExp(`^${label}\\s*\\d+$`) });

describe("Panel del analista: filtros, búsqueda y orden", () => {
  it("muestra el presupuesto y los importes en quetzales", async () => {
    const { container } = await renderLoaded();
    await waitFor(() => expect(container.textContent).toContain("Q42,000.00"));
    expect(container.textContent).toContain("Comprometido Q8,000.00 de Q50,000.00");
    expect(container.textContent).not.toContain("$");
  });

  it("las tarjetas de estado muestran el conteo de cada uno", async () => {
    await renderLoaded();
    expect(card("Creada").textContent).toContain("1");
    expect(card("En revisión").textContent).toContain("1");
    expect(card("Aprobada").textContent).toContain("2");
    expect(card("Rechazada").textContent).toContain("1");
  });

  it("al pulsar una tarjeta se filtra por ese estado y al pulsarla otra vez se quita el filtro", async () => {
    const { container } = await renderLoaded();
    expect(names(container)).toHaveLength(5);

    fireEvent.click(card("Aprobada"));
    expect(card("Aprobada").getAttribute("aria-pressed")).toBe("true");
    expect(card("Rechazada").getAttribute("aria-pressed")).toBe("false");
    expect(names(container)).toEqual(["Diego Pérez", "Ana López"]); // más reciente primero
    expect(screen.getByText("Mostrando 2 de 5 solicitudes")).toBeTruthy();

    fireEvent.click(card("Aprobada"));
    expect(card("Aprobada").getAttribute("aria-pressed")).toBe("false");
    expect(names(container)).toHaveLength(5);
  });

  it("elegir otra tarjeta cambia el filtro y el selector de estado se mantiene sincronizado", async () => {
    const { container } = await renderLoaded();
    fireEvent.click(card("Rechazada"));
    expect(names(container)).toEqual(["Carla Díaz"]);
    expect((screen.getByLabelText("Estado") as HTMLSelectElement).value).toBe("RECHAZADA");

    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "CREADA" } });
    expect(names(container)).toEqual(["Álvaro Zúñiga"]);
    expect(card("Creada").getAttribute("aria-pressed")).toBe("true");
  });

  it("el buscador encuentra por nombre sin importar mayúsculas ni tildes", async () => {
    const { container } = await renderLoaded();
    fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "PEREZ" } });
    expect(names(container)).toEqual(["Diego Pérez", "Bruno Pérez"]);
    fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "alvaro" } });
    expect(names(container)).toEqual(["Álvaro Zúñiga"]);
  });

  it("ordena por monto de menor a mayor y de mayor a menor", async () => {
    const { container } = await renderLoaded();
    fireEvent.change(screen.getByLabelText("Ordenar por"), { target: { value: "MONTO_ASC" } });
    expect(names(container)).toEqual(["Bruno Pérez", "Carla Díaz", "Diego Pérez", "Ana López", "Álvaro Zúñiga"]);
    fireEvent.change(screen.getByLabelText("Ordenar por"), { target: { value: "MONTO_DESC" } });
    expect(names(container)).toEqual(["Álvaro Zúñiga", "Ana López", "Diego Pérez", "Carla Díaz", "Bruno Pérez"]);
  });

  it("ordena por fecha y por nombre", async () => {
    const { container } = await renderLoaded();
    fireEvent.change(screen.getByLabelText("Ordenar por"), { target: { value: "FECHA_ASC" } });
    expect(names(container)).toEqual(["Bruno Pérez", "Álvaro Zúñiga", "Ana López", "Carla Díaz", "Diego Pérez"]);
    fireEvent.change(screen.getByLabelText("Ordenar por"), { target: { value: "NOMBRE_ASC" } });
    expect(names(container)).toEqual(["Álvaro Zúñiga", "Ana López", "Bruno Pérez", "Carla Díaz", "Diego Pérez"]);
    fireEvent.change(screen.getByLabelText("Ordenar por"), { target: { value: "NOMBRE_DESC" } });
    expect(names(container)).toEqual(["Diego Pérez", "Carla Díaz", "Bruno Pérez", "Ana López", "Álvaro Zúñiga"]);
  });

  it("estado, búsqueda y orden se combinan, y 'Limpiar filtros' lo deja todo como al inicio", async () => {
    const { container } = await renderLoaded();
    expect(screen.queryByRole("button", { name: "Limpiar filtros" })).toBeNull();

    fireEvent.click(card("Aprobada"));
    fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "ana" } });
    fireEvent.change(screen.getByLabelText("Ordenar por"), { target: { value: "MONTO_ASC" } });
    expect(names(container)).toEqual(["Ana López"]);

    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(names(container)).toHaveLength(5);
    expect((screen.getByLabelText("Buscar") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Ordenar por") as HTMLSelectElement).value).toBe("FECHA_DESC");
    expect(card("Aprobada").getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("button", { name: "Limpiar filtros" })).toBeNull();
  });

  it("avisa cuando ninguna solicitud coincide, sin confundirlo con 'no hay solicitudes'", async () => {
    await renderLoaded();
    fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "zzzz" } });
    expect(screen.getByText("Ninguna solicitud coincide con los filtros.")).toBeTruthy();
    expect(screen.getByText("Mostrando 0 de 5 solicitudes")).toBeTruthy();
    expect(screen.queryByText("No hay solicitudes.")).toBeNull();
  });

  it("los botones de acción siguen apareciendo en las filas filtradas", async () => {
    await renderLoaded();
    fireEvent.click(card("En revisión"));
    const row = screen.getByText("Bruno Pérez").closest("tr") as HTMLElement;
    expect(within(row).getByRole("button", { name: "Aprobar" })).toBeTruthy();
    expect(within(row).getByRole("button", { name: "Rechazar" })).toBeTruthy();
  });
});
