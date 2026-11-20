import { BUREAU_STALE_MS } from "./rules";

type RequestStatusName = "CREADA" | "EN_REVISION" | "APROBADA" | "RECHAZADA";
type BureauStatusName = "NO_CONSULTADO" | "CONSULTANDO" | "COMPLETADO" | "FALLIDO";

export interface BureauRetryInput {
  status: RequestStatusName;
  bureauStatus: BureauStatusName;
  /** Última modificación de la solicitud (ISO 8601 o epoch en ms). */
  updatedAt: string | number | Date;
}

/**
 * Indica si el analista puede relanzar la consulta de buró.
 *
 * - FALLIDO: se agotaron los reintentos, siempre se puede volver a intentar.
 * - CONSULTANDO / NO_CONSULTADO: solo si llevan más de BUREAU_STALE_MS sin avanzar. Es el caso
 *   de un reinicio del servidor a mitad de la consulta; sin esto la solicitud quedaría
 *   "Consultando…" para siempre y no se podría aprobar. El servidor aplica el mismo umbral.
 * - COMPLETADO o solicitud ya resuelta: nunca.
 */
export function canRetryBureau(input: BureauRetryInput, nowMs: number = Date.now()): boolean {
  if (input.status === "APROBADA" || input.status === "RECHAZADA") return false;
  if (input.bureauStatus === "COMPLETADO") return false;
  if (input.bureauStatus === "FALLIDO") return true;
  return nowMs - new Date(input.updatedAt).getTime() > BUREAU_STALE_MS;
}
