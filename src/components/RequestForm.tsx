"use client";

import { useEffect, useMemo, useState } from "react";
import { ALLOWED_TERMS, createRequestSchema, maxAllowedAmountCents } from "@/domain/rules";
import { formatMoney, toCents } from "@/domain/money";
import { AmortizationTable } from "./AmortizationTable";
import { apiFetch, errorMessage } from "./api";

type Field = "applicantName" | "documentId" | "monthlyIncome" | "amount" | "termMonths";

const EMPTY = { applicantName: "", documentId: "", monthlyIncome: "", amount: "", termMonths: "12" };

function toNumber(v: string): number {
  return v.trim() === "" ? Number.NaN : Number(v.replace(",", "."));
}

type Eligibility = { state: "idle" } | { state: "checking" } | { state: "ok" } | { state: "blocked"; reason: string };

export function RequestForm({ onCreated }: { onCreated: () => void }) {
  const [values, setValues] = useState(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [eligibility, setEligibility] = useState<Eligibility>({ state: "idle" });
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const candidate = useMemo(
    () => ({
      applicantName: values.applicantName,
      documentId: values.documentId,
      monthlyIncome: toNumber(values.monthlyIncome),
      amount: toNumber(values.amount),
      termMonths: Number(values.termMonths),
    }),
    [values],
  );

  // Validación en el cliente con el MISMO esquema que usa el servidor.
  const parsed = createRequestSchema.safeParse(candidate);
  const errors: Partial<Record<Field, string>> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as Field | undefined;
      if (key && !errors[key]) errors[key] = issue.message;
    }
  }

  // Regla de historial: se consulta al servidor mientras el usuario escribe (con debounce).
  const normalizedDoc = values.documentId.trim().toUpperCase();
  useEffect(() => {
    if (!/^[A-Z0-9-]{5,20}$/.test(normalizedDoc)) {
      setEligibility({ state: "idle" });
      return;
    }
    setEligibility({ state: "checking" });
    const controller = new AbortController();
    const t = setTimeout(() => {
      apiFetch<{ eligible: boolean; reason: string | null }>(
        `/api/requests/eligibility?documentId=${encodeURIComponent(normalizedDoc)}`,
        { signal: controller.signal },
      )
        .then((r) => setEligibility(r.eligible ? { state: "ok" } : { state: "blocked", reason: r.reason ?? "" }))
        .catch(() => {
          if (!controller.signal.aborted) setEligibility({ state: "idle" });
        });
    }, 400);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [normalizedDoc]);

  const set = (field: Field) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    setSuccess(null);
    setServerError(null);
  };
  const blur = (field: Field) => () => setTouched((t) => ({ ...t, [field]: true }));
  const show = (field: Field) => (touched[field] ? errors[field] : undefined);

  const incomeCents = Number.isFinite(candidate.monthlyIncome) ? toCents(candidate.monthlyIncome) : 0;
  const amountCents = Number.isFinite(candidate.amount) && candidate.amount > 0 ? toCents(candidate.amount) : 0;
  const canSubmit = parsed.success && eligibility.state === "ok" && !submitting;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ applicantName: true, documentId: true, monthlyIncome: true, amount: true, termMonths: true });
    if (!canSubmit) return;
    setSubmitting(true);
    setServerError(null);
    try {
      await apiFetch("/api/requests", { method: "POST", body: JSON.stringify(candidate) });
      setSuccess("Solicitud registrada. Estamos consultando el buró crediticio en segundo plano.");
      setValues(EMPTY);
      setTouched({});
      onCreated();
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <h2>Nueva solicitud de desembolso</h2>
      <div className="grid">
        <label>
          Nombre del solicitante
          <input value={values.applicantName} onChange={set("applicantName")} onBlur={blur("applicantName")} />
          {show("applicantName") && <span className="field-error">{show("applicantName")}</span>}
        </label>
        <label>
          Documento de identidad
          <input value={values.documentId} onChange={set("documentId")} onBlur={blur("documentId")} />
          {show("documentId") && <span className="field-error">{show("documentId")}</span>}
          {eligibility.state === "checking" && <span className="hint">Verificando historial…</span>}
          {eligibility.state === "blocked" && <span className="field-error">{eligibility.reason}</span>}
        </label>
        <label>
          Ingreso mensual declarado (GTQ)
          <input
            inputMode="decimal"
            value={values.monthlyIncome}
            onChange={set("monthlyIncome")}
            onBlur={blur("monthlyIncome")}
          />
          {show("monthlyIncome") && <span className="field-error">{show("monthlyIncome")}</span>}
        </label>
        <label>
          Monto solicitado (GTQ)
          <input inputMode="decimal" value={values.amount} onChange={set("amount")} onBlur={blur("amount")} />
          {incomeCents > 0 && (
            <span className="hint">Máximo permitido (40% del ingreso): {formatMoney(maxAllowedAmountCents(incomeCents))}</span>
          )}
          {(touched.amount || values.amount !== "") && errors.amount && (
            <span className="field-error">{errors.amount}</span>
          )}
        </label>
        <label>
          Plazo
          <select value={values.termMonths} onChange={set("termMonths")}>
            {ALLOWED_TERMS.map((t) => (
              <option key={t} value={t}>
                {t} meses
              </option>
            ))}
          </select>
        </label>
      </div>

      {amountCents > 0 && !errors.amount && <AmortizationTable principalCents={amountCents} termMonths={candidate.termMonths} />}

      {serverError && <p className="alert error">{serverError}</p>}
      {success && <p className="alert success">{success}</p>}

      <button type="submit" className="primary" disabled={!canSubmit}>
        {submitting ? "Enviando…" : "Confirmar y enviar solicitud"}
      </button>
    </form>
  );
}
