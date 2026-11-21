import { describe, expect, it } from "vitest";
import {
  countByStatus,
  countUrgent,
  DEFAULT_SORT,
  filterAndSort,
  hasActiveFilters,
  isUrgent,
  matchesQuery,
  normalizeText,
  type SortKey,
  type ViewableRequest,
} from "@/domain/requestView";

function req(id: string, o: Partial<ViewableRequest> = {}): ViewableRequest {
  return {
    id,
    status: "CREADA",
    applicantName: "Persona",
    documentId: "0000000000000",
    amountCents: 100_000,
    createdAt: "2026-11-01T10:00:00.000Z",
    ...o,
  };
}

const data: ViewableRequest[] = [
  req("r1", { applicantName: "Ana López", documentId: "1111222233334", amountCents: 500_000, createdAt: "2026-11-03T09:00:00.000Z", status: "APROBADA" }),
  req("r2", { applicantName: "Bruno Pérez", documentId: "2222333344445", amountCents: 150_000, createdAt: "2026-11-01T09:00:00.000Z", status: "EN_REVISION" }),
  req("r3", { applicantName: "Álvaro Zúñiga", documentId: "3333444455556", amountCents: 900_000, createdAt: "2026-11-02T09:00:00.000Z", status: "CREADA" }),
  req("r4", { applicantName: "Carla Díaz", documentId: "4444555566667", amountCents: 150_000, createdAt: "2026-11-04T09:00:00.000Z", status: "RECHAZADA" }),
];

const ids = (rows: ViewableRequest[]) => rows.map((r) => r.id);
const run = (
  sort: SortKey,
  extra: { status?: ViewableRequest["status"] | "TODAS"; query?: string; urgentOnly?: boolean } = {},
) =>
  ids(
    filterAndSort(data, {
      status: extra.status ?? "TODAS",
      query: extra.query ?? "",
      sort,
      urgentOnly: extra.urgentOnly ?? false,
    }),
  );

describe("Búsqueda de solicitudes", () => {
  it("ignora mayúsculas y tildes", () => {
    expect(normalizeText("  PÉREZ ")).toBe("perez");
    expect(matchesQuery(data[1]!, "perez")).toBe(true);
    expect(matchesQuery(data[2]!, "alvaro zuniga")).toBe(true);
  });

  it("busca por nombre, documento o identificador", () => {
    expect(run("FECHA_DESC", { query: "lópez" })).toEqual(["r1"]);
    expect(run("FECHA_DESC", { query: "3333444455556" })).toEqual(["r3"]);
    expect(run("FECHA_DESC", { query: "r4" })).toEqual(["r4"]);
  });

  it("exige que aparezcan todas las palabras, así que más palabras acotan más", () => {
    expect(run("FECHA_DESC", { query: "a" }).length).toBeGreaterThan(1);
    expect(run("FECHA_DESC", { query: "ana 1111" })).toEqual(["r1"]);
    expect(run("FECHA_DESC", { query: "ana 4444" })).toEqual([]);
  });

  it("una búsqueda vacía o de solo espacios no filtra nada", () => {
    expect(run("FECHA_DESC", { query: "   " })).toHaveLength(4);
  });
});

describe("Filtro por estado", () => {
  it("muestra solo las solicitudes del estado elegido", () => {
    expect(run("FECHA_DESC", { status: "APROBADA" })).toEqual(["r1"]);
    expect(run("FECHA_DESC", { status: "RECHAZADA" })).toEqual(["r4"]);
  });

  it("se combina con la búsqueda", () => {
    expect(run("FECHA_DESC", { status: "CREADA", query: "ana" })).toEqual([]);
    expect(run("FECHA_DESC", { status: "CREADA", query: "alvaro" })).toEqual(["r3"]);
  });

  it("cuenta cada estado, incluidos los que están en cero", () => {
    expect(countByStatus(data)).toEqual({ CREADA: 1, EN_REVISION: 1, APROBADA: 1, RECHAZADA: 1 });
    expect(countByStatus([])).toEqual({ CREADA: 0, EN_REVISION: 0, APROBADA: 0, RECHAZADA: 0 });
  });
});

describe("Orden de la lista", () => {
  it("por fecha, de la más reciente a la más antigua y al revés", () => {
    expect(run("FECHA_DESC")).toEqual(["r4", "r1", "r3", "r2"]);
    expect(run("FECHA_ASC")).toEqual(["r2", "r3", "r1", "r4"]);
  });

  it("por monto, de mayor a menor y de menor a mayor", () => {
    expect(run("MONTO_DESC")).toEqual(["r3", "r1", "r4", "r2"]);
    expect(run("MONTO_ASC")).toEqual(["r4", "r2", "r1", "r3"]); // r4 y r2 empatan en monto
  });

  it("con montos iguales desempata por fecha reciente, de forma estable", () => {
    // r2 y r4 tienen el mismo monto: r4 es más reciente
    expect(run("MONTO_DESC").slice(2)).toEqual(["r4", "r2"]);
    expect(run("MONTO_ASC").slice(0, 2)).toEqual(["r4", "r2"]);
  });

  it("por nombre, de la A a la Z y de la Z a la A, tratando Á como A", () => {
    expect(run("NOMBRE_ASC")).toEqual(["r3", "r1", "r2", "r4"]);
    expect(run("NOMBRE_DESC")).toEqual(["r4", "r2", "r1", "r3"]);
  });

  it("no modifica el arreglo original", () => {
    const copy = [...data];
    filterAndSort(data, { status: "TODAS", query: "", sort: "MONTO_ASC", urgentOnly: false });
    expect(data).toEqual(copy);
  });
});

describe("Filtros activos", () => {
  it("detecta cuándo hay algo distinto al estado inicial", () => {
    const base = { status: "TODAS", query: "", sort: DEFAULT_SORT, urgentOnly: false } as const;
    expect(hasActiveFilters(base)).toBe(false);
    expect(hasActiveFilters({ ...base, status: "APROBADA" })).toBe(true);
    expect(hasActiveFilters({ ...base, query: "ana" })).toBe(true);
    expect(hasActiveFilters({ ...base, query: "  " })).toBe(false);
    expect(hasActiveFilters({ ...base, sort: "MONTO_ASC" })).toBe(true);
    expect(hasActiveFilters({ ...base, urgentOnly: true })).toBe(true);
  });
});

describe("Marca de urgente", () => {
  // r2 (en revisión) y r3 (creada) urgentes; r1 aprobada con marca vieja; r4 rechazada sin marca.
  const flagged: ViewableRequest[] = [
    { ...data[0]!, urgent: true },
    { ...data[1]!, urgent: true },
    { ...data[2]!, urgent: true },
    { ...data[3]! },
  ];
  const runFlagged = (sort: SortKey, urgentOnly = false) =>
    ids(filterAndSort(flagged, { status: "TODAS", query: "", sort, urgentOnly }));

  it("solo cuenta como urgente una solicitud abierta con la marca puesta", () => {
    expect(isUrgent(flagged[1]!)).toBe(true); // en revisión
    expect(isUrgent(flagged[2]!)).toBe(true); // creada
    expect(isUrgent(flagged[0]!)).toBe(false); // aprobada: la marca ya no importa
    expect(isUrgent(flagged[3]!)).toBe(false); // sin marca
    expect(isUrgent({ status: "CREADA" })).toBe(false); // sin el campo, como lo recibe un solicitante
    expect(countUrgent(flagged)).toBe(2);
  });

  it("las urgentes van primero y dentro de cada grupo se respeta el orden elegido", () => {
    expect(runFlagged("FECHA_DESC")).toEqual(["r3", "r2", "r4", "r1"]);
    expect(runFlagged("FECHA_ASC")).toEqual(["r2", "r3", "r1", "r4"]);
    expect(runFlagged("MONTO_ASC")).toEqual(["r2", "r3", "r4", "r1"]);
    expect(runFlagged("NOMBRE_DESC")).toEqual(["r2", "r3", "r4", "r1"]);
  });

  it("el filtro de solo urgentes oculta el resto y se combina con estado y búsqueda", () => {
    expect(runFlagged("FECHA_DESC", true)).toEqual(["r3", "r2"]);
    expect(ids(filterAndSort(flagged, { status: "EN_REVISION", query: "", sort: "FECHA_DESC", urgentOnly: true }))).toEqual(["r2"]);
    expect(ids(filterAndSort(flagged, { status: "TODAS", query: "alvaro", sort: "FECHA_DESC", urgentOnly: true }))).toEqual(["r3"]);
    // r1 sigue marcada pero está aprobada, así que no aparece como urgente
    expect(ids(filterAndSort(flagged, { status: "APROBADA", query: "", sort: "FECHA_DESC", urgentOnly: true }))).toEqual([]);
  });

  it("sin ninguna marca el orden no cambia", () => {
    expect(run("FECHA_DESC")).toEqual(["r4", "r1", "r3", "r2"]);
  });
});
