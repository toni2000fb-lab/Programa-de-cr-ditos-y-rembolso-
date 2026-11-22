"use client";

import { useCallback, useRef, useState } from "react";
import { canRetryBureau } from "@/domain/bureau";
import { MIN_REJECTION_REASON_LENGTH } from "@/domain/rules";
import { PENDING_STATUSES } from "@/domain/stateMachine";
import { apiFetch, errorMessage } from "./api";
import type { RequestDTO } from "./types";

/** Botones de decisión de una solicitud (revisar, aprobar, rechazar, urgente y reintentar buró). */
type Busy = "review" | "approve" | "reject" | "bureau" | "urgent";

export function RequestActions({ r, onDone }: { r: RequestDTO; onDone: () => void }) {
  const [busy, setBusy] = useState<Busy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  // Una clave por intención de decisión: los reintentos/doble clic reutilizan la misma clave.
  const keys = useRef<Partial<Record<"approve" | "reject", string>>>({});

  const run = useCallback(
    async (kind: Busy, url: string, body: unknown, idemKind?: "approve" | "reject") => {
      if (busy) return; // evita doble clic en el cliente; el servidor también lo garantiza
      setBusy(kind);
      setError(null);
      const headers: Record<string, string> = {};
      if (idemKind) {
        keys.current[idemKind] ??= crypto.randomUUID();
        headers["Idempotency-Key"] = keys.current[idemKind];
      }
      try {
        await apiFetch(url, { method: "POST", body: JSON.stringify(body), headers });
        setRejecting(false);
        onDone();
      } catch (e) {
        setError(errorMessage(e));
        if (idemKind) delete keys.current[idemKind];
        onDone();
      } finally {
        setBusy(null);
      }
    },
    [busy, onDone],
  );

  const base = `/api/requests/${r.id}`;
  const reasonOk = reason.trim().length >= MIN_REJECTION_REASON_LENGTH;
  const showBureauRetry = canRetryBureau(r);

  return (
    <div className="actions">
      {r.status === "CREADA" && (
        <button onClick={() => run("review", `${base}/review`, {})} disabled={!!busy}>
          {busy === "review" ? "Tomando…" : "Tomar en revisión"}
        </button>
      )}
      {r.status === "EN_REVISION" && (
        <>
          <button
            className="approve"
            onClick={() => run("approve", `${base}/approve`, {}, "approve")}
            disabled={!!busy || r.bureauStatus !== "COMPLETADO"}
            title={r.bureauStatus !== "COMPLETADO" ? "Requiere consulta de buró completada" : undefined}
          >
            {busy === "approve" ? "Aprobando…" : "Aprobar"}
          </button>
          <button className="reject" onClick={() => setRejecting((v) => !v)} disabled={!!busy}>
            Rechazar
          </button>
        </>
      )}
      {PENDING_STATUSES.includes(r.status) && (
        <button
          className={r.urgent ? "urgent on" : "urgent"}
          onClick={() => run("urgent", `${base}/urgent`, { urgent: !r.urgent })}
          disabled={!!busy}
          title={r.urgent ? "Quitar la marca de urgente" : "Marcar para atender primero"}
        >
          {busy === "urgent" ? "Guardando…" : r.urgent ? "Quitar urgente" : "Marcar urgente"}
        </button>
      )}
      {showBureauRetry && (
        <button
          onClick={() => run("bureau", `${base}/bureau`, {})}
          disabled={!!busy}
          title={r.bureauStatus === "FALLIDO" ? undefined : "La consulta lleva demasiado tiempo sin avanzar"}
        >
          {busy === "bureau" ? (
            <>
              <span className="spinner" aria-hidden /> Consultando…
            </>
          ) : (
            "Reintentar buró"
          )}
        </button>
      )}
      {rejecting && r.status === "EN_REVISION" && (
        <div className="reject-box">
          <textarea
            placeholder={`Motivo del rechazo (mínimo ${MIN_REJECTION_REASON_LENGTH} caracteres)`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
          />
          <div className="row">
            <span className={reasonOk ? "hint" : "field-error"}>
              {reason.trim().length}/{MIN_REJECTION_REASON_LENGTH}
            </span>
            <button
              className="reject"
              disabled={!reasonOk || !!busy}
              onClick={() => run("reject", `${base}/reject`, { reason }, "reject")}
            >
              {busy === "reject" ? "Rechazando…" : "Confirmar rechazo"}
            </button>
          </div>
        </div>
      )}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}
