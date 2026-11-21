import {
  PRIORITY_LABEL,
  priorityFromTenure,
  TENURE_LABEL,
  type EmploymentTenureValue,
} from "@/domain/priority";
import { STATUS_LABEL, type RequestStatusValue } from "@/domain/stateMachine";

export function StatusBadge({ status }: { status: RequestStatusValue }) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{STATUS_LABEL[status]}</span>;
}

/** Prioridad que corresponde a la antigüedad laboral declarada, con el dato que la origina. */
export function PriorityCell({ tenure }: { tenure: EmploymentTenureValue | null | undefined }) {
  const priority = priorityFromTenure(tenure);
  if (!priority || !tenure) return <span className="muted">Sin dato</span>;
  return (
    <>
      <span className={`badge badge-prioridad-${priority.toLowerCase()}`}>{PRIORITY_LABEL[priority]}</span>
      <span className="tenure">{TENURE_LABEL[tenure]}</span>
    </>
  );
}

type BureauStatusValue = "NO_CONSULTADO" | "CONSULTANDO" | "COMPLETADO" | "FALLIDO";

export function BureauCell({
  status,
  score,
  error,
  attempts,
}: {
  status: BureauStatusValue;
  score: number | null;
  error: string | null;
  attempts: number;
}) {
  switch (status) {
    case "CONSULTANDO":
    case "NO_CONSULTADO":
      return (
        <span className="bureau loading" aria-live="polite">
          <span className="spinner" aria-hidden /> Consultando buró…
        </span>
      );
    case "COMPLETADO":
      return (
        <span className="bureau ok" title={`Intentos acumulados: ${attempts}`}>
          Puntaje {score}
        </span>
      );
    case "FALLIDO":
      return (
        <span className="bureau fail" title={error ?? undefined}>
          No disponible
        </span>
      );
  }
}
