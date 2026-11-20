"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatUSD } from "@/domain/money";
import { MIN_REJECTION_REASON_LENGTH } from "@/domain/rules";
import { REQUEST_STATUSES, STATUS_LABEL, type RequestStatusValue } from "@/domain/stateMachine";
import { apiFetch, errorMessage } from "./api";
import { usePolledRequests } from "./MyRequests";
import { BureauCell, StatusBadge } from "./StatusBadge";
import type { BudgetDTO, RequestDTO } from "./types";

function BudgetCard({ refreshKey }: { refreshKey: number }) {
  const [budget, setBudget] = useState<BudgetDTO | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      apiFetch<BudgetDTO>("/api/budget")
        .then((b) => alive && setBudget(b))
        .catch(() => undefined);
    void load();
    const t = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [refreshKey]);

  const pct = budget ? Math.round((budget.availableCents / budget.initialCents) * 100) : 0;
  return (
    <section className="card budget">
      <span className="label">Presupuesto global disponible</span>
      <strong className="big">{budget ? formatUSD(budget.availableCents) : "—"}</strong>
      <div className="bar" aria-hidden>
        <div style={{ width: `${pct}%` }} />
      </div>
      {budget && (
        <span className="muted">
          Comprometido {formatUSD(budget.committedCents)} de {formatUSD(budget.initialCents)}
        </span>
      )}
    </section>
  );
}

type Busy = "review" | "approve" | "reject" | "bureau";

function RequestActions({ r, onDone }: { r: RequestDTO; onDone: () => void }) {
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
  const bureauBusy = r.bureauStatus === "CONSULTANDO" || r.bureauStatus === "NO_CONSULTADO";

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
      {(r.status === "CREADA" || r.status === "EN_REVISION") && r.bureauStatus === "FALLIDO" && (
        <button onClick={() => run("bureau", `${base}/bureau`, {})} disabled={!!busy || bureauBusy}>
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

export function AnalystDashboard() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { requests, error, reload } = usePolledRequests(refreshKey);
  const [filter, setFilter] = useState<RequestStatusValue | "TODAS">("TODAS");
  const onDone = useCallback(() => {
    void reload();
    setRefreshKey((k) => k + 1);
  }, [reload]);

  const visible = (requests ?? []).filter((r) => filter === "TODAS" || r.status === filter);
  const counts = Object.fromEntries(
    REQUEST_STATUSES.map((s) => [s, (requests ?? []).filter((r) => r.status === s).length]),
  ) as Record<RequestStatusValue, number>;

  return (
    <div className="stack">
      <div className="kpis">
        <BudgetCard refreshKey={refreshKey} />
        {REQUEST_STATUSES.map((s) => (
          <section key={s} className="card kpi">
            <span className="label">{STATUS_LABEL[s]}</span>
            <strong className="big">{counts[s]}</strong>
          </section>
        ))}
      </div>
      <section className="card">
        <div className="row between">
          <h2>Solicitudes</h2>
          <select value={filter} onChange={(e) => setFilter(e.target.value as RequestStatusValue | "TODAS")}>
            <option value="TODAS">Todas</option>
            {REQUEST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="alert error">{error}</p>}
        {requests === null ? (
          <p className="muted">Cargando…</p>
        ) : visible.length === 0 ? (
          <p className="muted">No hay solicitudes.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Solicitante</th>
                  <th>Documento</th>
                  <th>Ingreso</th>
                  <th>Monto</th>
                  <th>Plazo</th>
                  <th>Buró</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.createdAt).toLocaleString("es")}</td>
                    <td>{r.applicantName}</td>
                    <td>{r.documentId}</td>
                    <td>{formatUSD(r.monthlyIncomeCents)}</td>
                    <td>{formatUSD(r.amountCents)}</td>
                    <td>{r.termMonths} m</td>
                    <td>
                      <BureauCell status={r.bureauStatus} score={r.bureauScore} error={r.bureauError} attempts={r.bureauAttempts} />
                    </td>
                    <td>
                      <StatusBadge status={r.status} />
                      {r.rejectionReason && <div className="reason">Motivo: {r.rejectionReason}</div>}
                    </td>
                    <td>
                      <RequestActions r={r} onDone={onDone} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
