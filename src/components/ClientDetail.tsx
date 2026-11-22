"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { evaluateRequest, type Check, type CheckStatus } from "@/domain/evaluation";
import { formatMoney } from "@/domain/money";
import { TENURE_LABEL } from "@/domain/priority";
import { ROLE_LABEL } from "@/domain/roles";
import { STATUS_LABEL } from "@/domain/stateMachine";
import type { RequestDetail } from "@/server/services/request-detail";
import { AmortizationTable } from "./AmortizationTable";
import { ApiError, apiFetch, errorMessage } from "./api";
import { RequestActions } from "./RequestActions";
import { BureauCell, PriorityCell, StatusBadge } from "./StatusBadge";

const dateTime = (iso: string) => new Date(iso).toLocaleString("es-GT");

/** Carga el detalle y lo mantiene al día; más seguido mientras el buró está consultando. */
function usePolledDetail(id: string) {
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    try {
      setDetail(await apiFetch<RequestDetail>(`/api/requests/${id}`));
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setNotFound(true);
      else setError(errorMessage(e));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const consulting = detail?.request.bureauStatus === "CONSULTANDO" || detail?.request.bureauStatus === "NO_CONSULTADO";
  useEffect(() => {
    if (notFound) return;
    const t = setInterval(() => void load(), consulting ? 2000 : 6000);
    return () => clearInterval(t);
  }, [consulting, load, notFound]);

  return { detail, error, notFound, reload: load };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

const CHECK_ICON: Record<CheckStatus, { icon: string; text: string }> = {
  ok: { icon: "✓", text: "Cumple" },
  fail: { icon: "✗", text: "No cumple" },
  pending: { icon: "…", text: "Pendiente" },
  na: { icon: "–", text: "No aplica" },
};

function CheckItem({ check }: { check: Check }) {
  const { icon, text } = CHECK_ICON[check.status];
  return (
    <li className={`check check-${check.status}`}>
      <span className="check-icon" role="img" aria-label={text}>
        {icon}
      </span>
      <span>
        <strong>{check.label}</strong>
        <span className="hint">{check.detail}</span>
      </span>
    </li>
  );
}

export function ClientDetail({ id }: { id: string }) {
  const { detail, error, notFound, reload } = usePolledDetail(id);

  if (notFound) {
    return (
      <section className="card">
        <h2>Solicitud no encontrada</h2>
        <p className="muted">No existe una solicitud con ese identificador.</p>
        <Link href="/analista">Volver al panel</Link>
      </section>
    );
  }
  if (!detail) {
    return <section className="card">{error ? <p className="alert error">{error}</p> : <p className="muted">Cargando…</p>}</section>;
  }

  const { request: r, createdBy, history, audit, availableBudgetCents } = detail;
  const evaluation = evaluateRequest({
    status: r.status,
    amountCents: r.amountCents,
    monthlyIncomeCents: r.monthlyIncomeCents,
    termMonths: r.termMonths,
    bureauStatus: r.bureauStatus,
    bureauScore: r.bureauScore,
    bureauAttempts: r.bureauAttempts,
    availableBudgetCents,
  });
  const { financials: f } = evaluation;
  const open = r.status === "CREADA" || r.status === "EN_REVISION";

  return (
    <div className="stack">
      <Link href="/analista" className="back-link">
        ← Volver al panel
      </Link>

      <section className="card">
        <div className="row between wrap">
          <div>
            <h2>{r.applicantName}</h2>
            <p className="muted">
              Documento <span className="mono">{r.documentId}</span> · Solicitud del {dateTime(r.createdAt)}
            </p>
            <div className="row wrap">
              <StatusBadge status={r.status} />
              {open && r.urgent && <span className="badge badge-urgente">Urgente</span>}
            </div>
            {r.rejectionReason && <p className="reason">Motivo del rechazo: {r.rejectionReason}</p>}
          </div>
          <RequestActions r={r} onDone={() => void reload()} />
        </div>
        {error && <p className="alert error">{error}</p>}
        {open &&
          (evaluation.canApprove ? (
            <p className="alert success">Cumple las condiciones del sistema para aprobar. La decisión es del analista.</p>
          ) : (
            <p className="alert warn">Aún no se puede aprobar. Falta: {evaluation.blockers.join(", ")}.</p>
          ))}
      </section>

      <div className="detail-grid">
        <section className="card">
          <h3>Datos del cliente</h3>
          <dl className="kv">
            <Field label="Nombre">{r.applicantName}</Field>
            <Field label="Documento">
              <span className="mono">{r.documentId}</span>
            </Field>
            <Field label="Tiempo en su trabajo actual">
              {r.employmentTenure ? TENURE_LABEL[r.employmentTenure] : <span className="muted">Sin dato</span>}
            </Field>
            <Field label="Prioridad">
              <PriorityCell tenure={r.employmentTenure} />
            </Field>
            <Field label="Ingreso mensual declarado">{formatMoney(r.monthlyIncomeCents)}</Field>
            <Field label="Registrada por">
              {createdBy.name} <span className="muted">({ROLE_LABEL[createdBy.role]})</span>
            </Field>
          </dl>
        </section>

        <section className="card">
          <h3>Crédito solicitado</h3>
          <dl className="kv">
            <Field label="Monto">{formatMoney(r.amountCents)}</Field>
            <Field label="Plazo">{r.termMonths} meses</Field>
            <Field label="Monto sobre el ingreso">
              {f.amountToIncomePct} % <span className="muted">(máximo 40 %)</span>
            </Field>
            <Field label="Cuota mensual estimada">{formatMoney(f.monthlyPaymentCents)}</Field>
            <Field label="Cuota sobre el ingreso">{f.paymentToIncomePct} %</Field>
            <Field label="Total de intereses">{formatMoney(f.totalInterestCents)}</Field>
            <Field label="Total a pagar">{formatMoney(f.totalPaidCents)}</Field>
          </dl>
        </section>

        <section className="card">
          <h3>Verificación para aprobar</h3>
          <ul className="check-list">
            {evaluation.checks.map((c) => (
              <CheckItem key={c.id} check={c} />
            ))}
          </ul>
        </section>

        <section className="card">
          <h3>Buró de crédito</h3>
          <dl className="kv">
            <Field label="Resultado">
              <BureauCell status={r.bureauStatus} score={r.bureauScore} error={r.bureauError} attempts={r.bureauAttempts} />
            </Field>
            <Field label="Intentos">{r.bureauAttempts}</Field>
            <Field label="Última consulta">{r.bureauCheckedAt ? dateTime(r.bureauCheckedAt) : <span className="muted">Ninguna</span>}</Field>
          </dl>
        </section>
      </div>

      <section className="card">
        <h3>Historial del cliente</h3>
        {history.length === 0 ? (
          <p className="muted">Este documento no tiene otras solicitudes.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Monto</th>
                  <th>Plazo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td>{dateTime(h.createdAt)}</td>
                    <td>{formatMoney(h.amountCents)}</td>
                    <td>{h.termMonths} m</td>
                    <td>
                      <Link href={`/analista/solicitudes/${h.id}`}>{STATUS_LABEL[h.status]}</Link>
                      {h.rejectionReason && <div className="reason">Motivo: {h.rejectionReason}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AmortizationTable principalCents={r.amountCents} termMonths={r.termMonths} />

      <section className="card">
        <h3>Seguimiento</h3>
        {audit.length === 0 ? (
          <p className="muted">Sin movimientos.</p>
        ) : (
          <ol className="timeline">
            {audit.map((a) => (
              <li key={a.id}>
                <time dateTime={a.timestamp}>{dateTime(a.timestamp)}</time>
                <strong>
                  {a.fromStatus && a.fromStatus !== a.toStatus
                    ? `${STATUS_LABEL[a.fromStatus]} → ${STATUS_LABEL[a.toStatus]}`
                    : STATUS_LABEL[a.toStatus]}
                </strong>{" "}
                <span className="muted">
                  {a.actorName} ({ROLE_LABEL[a.actorRole]})
                </span>
                {a.comment && <div className="hint">{a.comment}</div>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
