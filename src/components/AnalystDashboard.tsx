"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/domain/money";
import {
  countByStatus,
  DEFAULT_SORT,
  filterAndSort,
  hasActiveFilters,
  type PriorityFilter,
  type SortKey,
  type StatusFilter,
} from "@/domain/requestView";
import { apiFetch } from "./api";
import { usePolledRequests } from "./MyRequests";
import { RequestActions } from "./RequestActions";
import { RequestToolbar, StatusKpiCards } from "./RequestFilters";
import { BureauCell, PriorityCell, StatusBadge } from "./StatusBadge";
import type { BudgetDTO } from "./types";

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

/** Ignora los clics sobre botones, enlaces y campos: la fila solo navega si se pulsa en otro lugar. */
const isInteractive = (target: EventTarget) =>
  target instanceof Element && target.closest("a, button, input, select, textarea, label") !== null;

export function AnalystDashboard() {
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);
  const { requests, error, reload } = usePolledRequests(refreshKey);
  const [status, setStatus] = useState<StatusFilter>("TODAS");
  const [priority, setPriority] = useState<PriorityFilter>("TODAS");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT);
  const onDone = useCallback(() => {
    void reload();
    setRefreshKey((k) => k + 1);
  }, [reload]);

  const all = useMemo(() => requests ?? [], [requests]);
  const view = useMemo(() => ({ status, priority, query, sort }), [status, priority, query, sort]);
  const visible = useMemo(() => filterAndSort(all, view), [all, view]);
  const counts = useMemo(() => countByStatus(all), [all]);
  const filtersActive = hasActiveFilters(view);
  const clearFilters = () => {
    setStatus("TODAS");
    setPriority("TODAS");
    setQuery("");
    setSort(DEFAULT_SORT);
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
          filtersActive={filtersActive}
          onStatus={setStatus}
          onPriority={setPriority}
          onQuery={setQuery}
          onSort={setSort}
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
                  <th>Cliente</th>
                  <th>Asesor</th>
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
                  <tr
                    key={r.id}
                    className="clickable"
                    onClick={(e) => {
                      if (!isInteractive(e.target)) router.push(`/analista/solicitudes/${r.id}`);
                    }}
                  >
                    <td>{new Date(r.createdAt).toLocaleString("es-GT")}</td>
                    <td>
                      <Link href={`/analista/solicitudes/${r.id}`} className="client-link" title="Ver el detalle del cliente">
                        {r.applicantName}
                      </Link>
                    </td>
                    <td>{r.createdByName ?? "—"}</td>
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
