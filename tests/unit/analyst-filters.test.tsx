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
    employmentTenure: null,
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

const baseRequests: RequestDTO[] = [
  dto("r1", { applicantName: "Ana López", employmentTenure: "TRES_ANIOS_O_MAS", amountCents: 500_000, createdAt: "2026-11-03T09:00:00.000Z", status: "APROBADA" }),
  dto("r2", { applicantName: "Bruno Pérez", employmentTenure: "MENOS_DE_1_ANIO", amountCents: 150_000, createdAt: "2026-11-01T09:00:00.000Z", status: "EN_REVISION" }),
  dto("r3", { applicantName: "Álvaro Zúñiga", employmentTenure: "DE_1_A_3_ANIOS", amountCents: 900_000, createdAt: "2026-11-02T09:00:00.000Z", status: "CREADA" }),
  dto("r4", { applicantName: "Carla Díaz", employmentTenure: "TRES_ANIOS_O_MAS", amountCents: 250_000, createdAt: "2026-11-04T09:00:00.000Z", status: "RECHAZADA", rejectionReason: "Historial insuficiente" }),
  dto("r5", { applicantName: "Diego Pérez", amountCents: 300_000, createdAt: "2026-11-05T09:00:00.000Z", status: "APROBADA" }),
];

// El panel navega con el router de Next; en las pruebas se sustituye por un espía.
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

// Lo que "responde el servidor": se copia en cada prueba para poder marcar solicitudes sin afectar a las demás.
let requests: RequestDTO[];
const posts: { url: string; body: { urgent?: boolean } }[] = [];

beforeEach(() => {
  requests = baseRequests.map((r) => ({ ...r }));
  posts.length = 0;
  push.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { urgent?: boolean };
        posts.push({ url, body });
        const target = requests.find((r) => url === `/api/requests/${r.id}/urgent`);
        if (target) target.urgent = body.urgent;
        return json({ request: target });
      }
      return url.startsWith("/api/budget")
        ? json({ initialCents: 5_000_000, availableCents: 4_200_000, committedCents: 800_000, updatedAt: "2026-11-05T09:00:00.000Z" })
        : json({ requests });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Nombres de la columna "Cliente", en el orden en que se ven. */
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

describe("Panel del analista: marca de urgente", () => {
  const rowOf = (name: string) => screen.getByText(name).closest("tr") as HTMLElement;
  const urgentBadges = (container: HTMLElement) => container.querySelectorAll(".badge-urgente").length;
  const toggle = () => screen.getByRole("button", { name: /^Solo urgentes\s*\d+$/ });

  // Bruno (en revisión) y Álvaro (creada) urgentes. Ana ya está aprobada: su marca vieja no cuenta.
  const markSome = () => {
    for (const id of ["r1", "r2", "r3"]) requests.find((r) => r.id === id)!.urgent = true;
  };

  it("muestra la etiqueta y pone las urgentes primero, y una resuelta ya no cuenta", async () => {
    markSome();
    const { container } = await renderLoaded();
    expect(urgentBadges(container)).toBe(2);
    expect(within(rowOf("Álvaro Zúñiga")).getByText("Urgente")).toBeTruthy();
    expect(within(rowOf("Ana López")).queryByText("Urgente")).toBeNull();
    expect(names(container)).toEqual(["Álvaro Zúñiga", "Bruno Pérez", "Diego Pérez", "Carla Díaz", "Ana López"]);
    expect(toggle().textContent).toContain("2");
  });

  it("las urgentes siguen primero al cambiar el orden", async () => {
    markSome();
    const { container } = await renderLoaded();
    fireEvent.change(screen.getByLabelText("Ordenar por"), { target: { value: "MONTO_ASC" } });
    expect(names(container).slice(0, 2)).toEqual(["Bruno Pérez", "Álvaro Zúñiga"]);
  });

  it("'Solo urgentes' filtra, se combina con el estado y 'Limpiar filtros' lo apaga", async () => {
    markSome();
    const { container } = await renderLoaded();
    fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-pressed")).toBe("true");
    expect(names(container)).toEqual(["Álvaro Zúñiga", "Bruno Pérez"]);

    fireEvent.click(card("En revisión"));
    expect(names(container)).toEqual(["Bruno Pérez"]);

    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(toggle().getAttribute("aria-pressed")).toBe("false");
    expect(names(container)).toHaveLength(5);
  });

  it("el botón 'Marcar urgente' avisa al servidor y la solicitud pasa a verse como urgente", async () => {
    const { container } = await renderLoaded();
    expect(urgentBadges(container)).toBe(0);

    fireEvent.click(within(rowOf("Bruno Pérez")).getByRole("button", { name: "Marcar urgente" }));

    await waitFor(() => expect(urgentBadges(container)).toBe(1));
    expect(posts).toEqual([{ url: "/api/requests/r2/urgent", body: { urgent: true } }]);
    expect(names(container)[0]).toBe("Bruno Pérez");
    expect(within(rowOf("Bruno Pérez")).getByRole("button", { name: "Quitar urgente" })).toBeTruthy();
    expect(toggle().textContent).toContain("1");
  });

  it("el botón 'Quitar urgente' desmarca la solicitud", async () => {
    markSome();
    const { container } = await renderLoaded();
    fireEvent.click(within(rowOf("Álvaro Zúñiga")).getByRole("button", { name: "Quitar urgente" }));

    await waitFor(() => expect(urgentBadges(container)).toBe(1));
    expect(posts).toEqual([{ url: "/api/requests/r3/urgent", body: { urgent: false } }]);
  });

  it("las solicitudes resueltas no tienen botón de urgente", async () => {
    markSome();
    await renderLoaded();
    for (const name of ["Ana López", "Carla Díaz"]) {
      const row = rowOf(name);
      expect(within(row).queryByRole("button", { name: /urgente/i })).toBeNull();
    }
  });
});

describe("Panel del analista: prioridad por antigüedad laboral", () => {
  const rowOf = (name: string) => screen.getByText(name).closest("tr") as HTMLElement;

  it("muestra la prioridad y la antigüedad que la origina, y 'Sin dato' si falta", async () => {
    await renderLoaded();
    expect(within(rowOf("Ana López")).getByText("Alta")).toBeTruthy();
    expect(within(rowOf("Ana López")).getByText("3 años o más")).toBeTruthy();
    expect(within(rowOf("Álvaro Zúñiga")).getByText("Media")).toBeTruthy();
    expect(within(rowOf("Álvaro Zúñiga")).getByText("De 1 a menos de 3 años")).toBeTruthy();
    expect(within(rowOf("Bruno Pérez")).getByText("Baja")).toBeTruthy();
    expect(within(rowOf("Bruno Pérez")).getByText("Menos de 1 año")).toBeTruthy();
    expect(within(rowOf("Diego Pérez")).getByText("Sin dato")).toBeTruthy();
  });

  it("el filtro de prioridad deja solo las de ese nivel y se combina con el estado", async () => {
    const { container } = await renderLoaded();
    fireEvent.change(screen.getByLabelText("Prioridad"), { target: { value: "ALTA" } });
    expect(names(container)).toEqual(["Carla Díaz", "Ana López"]);

    fireEvent.click(card("Aprobada"));
    expect(names(container)).toEqual(["Ana López"]);

    fireEvent.change(screen.getByLabelText("Prioridad"), { target: { value: "BAJA" } });
    expect(names(container)).toEqual([]);
    expect(screen.getByText("Ninguna solicitud coincide con los filtros.")).toBeTruthy();
  });

  it("ordena por prioridad de alta a baja, con la más antigua primero dentro de cada nivel", async () => {
    const { container } = await renderLoaded();
    fireEvent.change(screen.getByLabelText("Ordenar por"), { target: { value: "PRIORIDAD_DESC" } });
    expect(names(container)).toEqual(["Ana López", "Carla Díaz", "Álvaro Zúñiga", "Bruno Pérez", "Diego Pérez"]);
    fireEvent.change(screen.getByLabelText("Ordenar por"), { target: { value: "PRIORIDAD_ASC" } });
    expect(names(container)).toEqual(["Diego Pérez", "Bruno Pérez", "Álvaro Zúñiga", "Ana López", "Carla Díaz"]);
  });

  it("'Limpiar filtros' también restablece la prioridad", async () => {
    const { container } = await renderLoaded();
    fireEvent.change(screen.getByLabelText("Prioridad"), { target: { value: "MEDIA" } });
    expect(names(container)).toEqual(["Álvaro Zúñiga"]);
    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect((screen.getByLabelText("Prioridad") as HTMLSelectElement).value).toBe("TODAS");
    expect(names(container)).toHaveLength(5);
  });
});

describe("Panel del analista: abrir el detalle del cliente", () => {
  const rowOf = (name: string) => screen.getByText(name).closest("tr") as HTMLElement;

  it("el nombre del cliente es un enlace a su detalle", async () => {
    await renderLoaded();
    const link = within(rowOf("Bruno Pérez")).getByRole("link", { name: "Bruno Pérez" });
    expect(link.getAttribute("href")).toBe("/analista/solicitudes/r2");
  });

  it("pulsar en cualquier parte de la fila abre el detalle", async () => {
    await renderLoaded();
    const cells = rowOf("Álvaro Zúñiga").querySelectorAll("td");
    fireEvent.click(cells[3]!); // la columna de ingreso
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/analista/solicitudes/r3");
  });

  it("pulsar un botón de la fila no abre el detalle", async () => {
    await renderLoaded();
    fireEvent.click(within(rowOf("Bruno Pérez")).getByRole("button", { name: "Marcar urgente" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(push).not.toHaveBeenCalled();
  });
});
