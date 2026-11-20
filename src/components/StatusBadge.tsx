import { STATUS_LABEL, type RequestStatusValue } from "@/domain/stateMachine";

export function StatusBadge({ status }: { status: RequestStatusValue }) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{STATUS_LABEL[status]}</span>;
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
