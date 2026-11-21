"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatMoney } from "@/domain/money";
import { canRetryBureau } from "@/domain/bureau";
import { MIN_REJECTION_REASON_LENGTH } from "@/domain/rules";
import { PENDING_STATUSES } from "@/domain/stateMachine";
import {
  countByStatus,
  countUrgent,
  DEFAULT_SORT,
  filterAndSort,
  hasActiveFilters,
  isUrgent,
  type PriorityFilter,
  type SortKey,
  type StatusFilter,
} from "@/domain/requestView";
import { apiFetch, errorMessage } from "./api";
import { usePolledRequests } from "./MyRequests";
import { RequestToolbar, StatusKpiCards } from "./RequestFilters";
import { BureauCell, PriorityCell, StatusBadge } from "./StatusBadge";
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
      <strong className="big">{budget ? formatMoney(budget.availableCents) : "—"}</strong>
      <div className="bar" aria-hidden>
        <div style={{ width: `${pct}%` }} />
      </div>
      {budget && (
        <span className="muted">
          Comprometido {formatMoney(budget.committedCents)} de {formatMoney(budget.initialCents)}
        </span>
      )}
    </section>
  );
}

type Busy = "review" | "approve" | "reject" | "bureau" | "urgent";

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

export function AnalystDashboard() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { requests, error, reload } = usePolledRequests(refreshKey);
  const [status, setStatus] = useState<StatusFilter>("TODAS");
  const [priority, setPriority] = useState<PriorityFilter>("TODAS");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT);
  const [urgentOnly, setUrgentOnly] = useState(false);
  const onDone = useCallback(() => {
    void reload();
    setRefreshKey((k) => k + 1);
  }, [reload]);

  const all = useMemo(() => requests ?? [], [requests]);
  const view = useMemo(
    () => ({ status, priority, query, sort, urgentOnly }),
    [status, priority, query, sort, urgentOnly],
  );
  const visible = useMemo(() => filterAndSort(all, view), [all, view]);
  const counts = useMemo(() => countByStatus(all), [all]);
  const urgentCount = useMemo(() => countUrgent(all), [all]);
  const filtersActive = hasActiveFilters(view);
  const clearFilters = () => {
    setStatus("TODAS");
    setPriority("TODAS");
    setQuery("");
    setSort(DEFAULT_SORT);
    setUrgentOnly(false);
  };

  return (
    <div className="stack">
      <div className="kpis">
        <BudgetCard refreshKey={refreshKey} />
        <StatusKpiCards counts={counts} active={status} onSelect={setStatus} />
      </div>
      <section className="card">
        <h2>Solicitudes</h2>
        <RequestToolbar
          status={status}
          priority={priority}
          query={query}
          sort={sort}
          shown={visible.length}
          total={all.length}
          urgentOnly={urgentOnly}
          urgentCount={urgentCount}
          filtersActive={filtersActive}
          onStatus={setStatus}
          onPriority={setPriority}
          onQuery={setQuery}
          onSort={setSort}
          onUrgentOnly={setUrgentOnly}
          onClear={clearFilters}
        />
        {error && <p className="alert error">{error}</p>}
        {requests === null ? (
          <p className="muted">Cargando…</p>
        ) : all.length === 0 ? (
          <p className="muted">No hay solicitudes.</p>
        ) : visible.length === 0 ? (
          <p className="muted">Ninguna solicitud coincide con los filtros.</p>
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
                  <th>Prioridad</th>
                  <th>Buró</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} className={isUrgent(r) ? "row-urgent" : undefined}>
                    <td>{new Date(r.createdAt).toLocaleString("es-GT")}</td>
                    <td>{r.applicantName}</td>
                    <td>{r.documentId}</td>
                    <td>{formatMoney(r.monthlyIncomeCents)}</td>
                    <td>{formatMoney(r.amountCents)}</td>
                    <td>{r.termMonths} m</td>
                    <td>
                      <PriorityCell tenure={r.employmentTenure} />
                    </td>
                    <td>
                      <BureauCell status={r.bureauStatus} score={r.bureauScore} error={r.bureauError} attempts={r.bureauAttempts} />
                    </td>
                    <td>
                      <StatusBadge status={r.status} />
                      {isUrgent(r) && <span className="badge badge-urgente">Urgente</span>}
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
