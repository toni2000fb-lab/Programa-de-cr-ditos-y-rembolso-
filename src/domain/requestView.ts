import type { RequestStatusValue } from "./stateMachine";
import { PENDING_STATUSES, REQUEST_STATUSES } from "./stateMachine";

/** Lógica pura (sin React) para filtrar, buscar y ordenar la lista de solicitudes del analista. */

export type StatusFilter = RequestStatusValue | "TODAS";

export type SortKey = "FECHA_DESC" | "FECHA_ASC" | "MONTO_DESC" | "MONTO_ASC" | "NOMBRE_ASC" | "NOMBRE_DESC";

export const DEFAULT_SORT: SortKey = "FECHA_DESC";

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "FECHA_DESC", label: "Fecha: más recientes primero" },
  { value: "FECHA_ASC", label: "Fecha: más antiguas primero" },
  { value: "MONTO_DESC", label: "Monto: de mayor a menor" },
  { value: "MONTO_ASC", label: "Monto: de menor a mayor" },
  { value: "NOMBRE_ASC", label: "Nombre: de A a Z" },
  { value: "NOMBRE_DESC", label: "Nombre: de Z a A" },
];

export interface ViewableRequest {
  id: string;
  status: RequestStatusValue;
  applicantName: string;
  documentId: string;
  amountCents: number;
  createdAt: string;
  /** Marca interna del analista. Puede venir sin definir si quien consulta no es analista. */
  urgent?: boolean;
}

export interface ViewOptions {
  status: StatusFilter;
  query: string;
  sort: SortKey;
  /** Mostrar solo las solicitudes urgentes. */
  urgentOnly: boolean;
}

/** Una solicitud cuenta como urgente solo mientras sigue abierta; al resolverse la marca deja de importar. */
export function isUrgent(request: Pick<ViewableRequest, "status" | "urgent">): boolean {
  return request.urgent === true && PENDING_STATUSES.includes(request.status);
}

/** Minúsculas y sin tildes, para que "perez" encuentre "Pérez". */
export function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

/**
 * Cada palabra de la búsqueda debe aparecer en el nombre, el documento o el identificador
 * (todas a la vez), de modo que "ana 1234" acota más que "ana".
 */
export function matchesQuery(request: ViewableRequest, query: string): boolean {
  const terms = normalizeText(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = normalizeText(`${request.applicantName} ${request.documentId} ${request.id}`);
  return terms.every((term) => haystack.includes(term));
}

const byName = (a: ViewableRequest, b: ViewableRequest) =>
  a.applicantName.localeCompare(b.applicantName, "es", { sensitivity: "base", numeric: true });
const byDate = (a: ViewableRequest, b: ViewableRequest) => Date.parse(a.createdAt) - Date.parse(b.createdAt);
const byAmount = (a: ViewableRequest, b: ViewableRequest) => a.amountCents - b.amountCents;

const COMPARATORS: Record<SortKey, (a: ViewableRequest, b: ViewableRequest) => number> = {
  FECHA_DESC: (a, b) => byDate(b, a),
  FECHA_ASC: byDate,
  MONTO_DESC: (a, b) => byAmount(b, a),
  MONTO_ASC: byAmount,
  NOMBRE_ASC: byName,
  NOMBRE_DESC: (a, b) => byName(b, a),
};

/** Las urgentes van siempre primero; dentro de cada grupo manda el orden elegido. */
const urgentFirst = (a: ViewableRequest, b: ViewableRequest) => Number(isUrgent(b)) - Number(isUrgent(a));

/** Filtra por estado, urgencia y búsqueda, y ordena. No modifica el arreglo original. */
export function filterAndSort<T extends ViewableRequest>(requests: readonly T[], options: ViewOptions): T[] {
  const primary = COMPARATORS[options.sort];
  return requests
    .filter(
      (r) =>
        (options.status === "TODAS" || r.status === options.status) &&
        (!options.urgentOnly || isUrgent(r)) &&
        matchesQuery(r, options.query),
    )
    .sort((a, b) => urgentFirst(a, b) || primary(a, b) || byDate(b, a) || a.id.localeCompare(b.id)); // desempate estable
}

export function countUrgent(requests: readonly ViewableRequest[]): number {
  return requests.filter(isUrgent).length;
}

export function countByStatus(requests: readonly ViewableRequest[]): Record<RequestStatusValue, number> {
  const counts = Object.fromEntries(REQUEST_STATUSES.map((s) => [s, 0])) as Record<RequestStatusValue, number>;
  for (const r of requests) counts[r.status] += 1;
  return counts;
}

export function hasActiveFilters(options: ViewOptions): boolean {
  return options.status !== "TODAS" || options.query.trim() !== "" || options.sort !== DEFAULT_SORT || options.urgentOnly;
}
