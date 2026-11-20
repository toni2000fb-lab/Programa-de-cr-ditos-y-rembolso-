export const REQUEST_STATUSES = ["CREADA", "EN_REVISION", "APROBADA", "RECHAZADA"] as const;
export type RequestStatusValue = (typeof REQUEST_STATUSES)[number];

/** Ciclo de vida: CREADA → EN_REVISION → (APROBADA | RECHAZADA). Sin saltos ni reversiones. */
const TRANSITIONS: Readonly<Record<RequestStatusValue, readonly RequestStatusValue[]>> = {
  CREADA: ["EN_REVISION"],
  EN_REVISION: ["APROBADA", "RECHAZADA"],
  APROBADA: [],
  RECHAZADA: [],
};

export function canTransition(from: RequestStatusValue, to: RequestStatusValue): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isFinal(status: RequestStatusValue): boolean {
  return TRANSITIONS[status].length === 0;
}

/**
 * Estados que la regla de historial considera "pendientes". La especificación menciona
 * un estado PENDIENTE que no existe en el ciclo; se interpreta como toda solicitud
 * aún no resuelta (CREADA o EN_REVISION).
 */
export const PENDING_STATUSES: readonly RequestStatusValue[] = ["CREADA", "EN_REVISION"];

export const STATUS_LABEL: Readonly<Record<RequestStatusValue, string>> = {
  CREADA: "Creada",
  EN_REVISION: "En revisión",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
};
