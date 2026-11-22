"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CLIENT_DOCUMENT_LABEL,
  CLIENT_DOCUMENTS,
  INCOME_TYPE_LABEL,
  INCOME_TYPES,
  normalizePhone,
  referenceIssues,
  type ClientDocumentValue,
} from "@/domain/clientProfile";
import { EMPLOYMENT_TENURES, TENURE_LABEL } from "@/domain/priority";
import { ALLOWED_TERMS, createRequestSchema, maxAllowedAmountCents } from "@/domain/rules";
import { formatMoney, toCents } from "@/domain/money";
import { AmortizationTable } from "./AmortizationTable";
import { apiFetch, errorMessage } from "./api";

const EMPTY = {
  applicantName: "",
  documentId: "",
  birthDate: "",
  phone: "",
  address: "",
  employerName: "",
  jobTitle: "",
  incomeType: "",
  employmentTenure: "",
  monthlyIncome: "",
  otherIncome: "",
  monthlyExpenses: "",
  currentDebtPayment: "",
  amount: "",
  termMonths: "12",
  purpose: "",
  guarantee: "",
  reference1Name: "",
  reference1Phone: "",
  reference2Name: "",
  reference2Phone: "",
};

type Values = typeof EMPTY;
type Field = keyof Values | "receivedDocuments";

function toNumber(v: string): number {
  return v.trim() === "" ? Number.NaN : Number(v.replace(",", "."));
}

type Eligibility = { state: "idle" } | { state: "checking" } | { state: "ok" } | { state: "blocked"; reason: string };

export function RequestForm({ onCreated }: { onCreated: () => void }) {
  const [values, setValues] = useState(EMPTY);
  const [docs, setDocs] = useState<ClientDocumentValue[]>([]);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [eligibility, setEligibility] = useState<Eligibility>({ state: "idle" });
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const candidate = useMemo(
    () => ({
      applicantName: values.applicantName,
      documentId: values.documentId,
      birthDate: values.birthDate,
      phone: values.phone,
      address: values.address,
      employerName: values.employerName,
      jobTitle: values.jobTitle,
      incomeType: values.incomeType === "" ? undefined : values.incomeType,
      employmentTenure: values.employmentTenure === "" ? undefined : values.employmentTenure,
      monthlyIncome: toNumber(values.monthlyIncome),
      otherIncome: toNumber(values.otherIncome),
      monthlyExpenses: toNumber(values.monthlyExpenses),
      currentDebtPayment: toNumber(values.currentDebtPayment),
      amount: toNumber(values.amount),
      termMonths: Number(values.termMonths),
      purpose: values.purpose,
      guarantee: values.guarantee,
      reference1Name: values.reference1Name,
      reference1Phone: values.reference1Phone,
      reference2Name: values.reference2Name,
      reference2Phone: values.reference2Phone,
      receivedDocuments: docs,
    }),
    [values, docs],
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
  // El esquema solo compara las referencias cuando el resto ya es válido; aquí se avisa desde el principio.
  for (const issue of referenceIssues({
    phone: normalizePhone(values.phone),
    reference1Phone: normalizePhone(values.reference1Phone),
    reference2Phone: normalizePhone(values.reference2Phone),
  })) {
    if (!errors[issue.path]) errors[issue.path] = issue.message;
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

  const set = (field: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    setSuccess(null);
    setServerError(null);
  };
  const toggleDoc = (doc: ClientDocumentValue) => {
    setDocs((current) => (current.includes(doc) ? current.filter((d) => d !== doc) : [...current, doc]));
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
    setTouched(Object.fromEntries([...Object.keys(EMPTY), "receivedDocuments"].map((f) => [f, true])));
    if (!canSubmit) return;
    setSubmitting(true);
    setServerError(null);
    try {
      await apiFetch("/api/requests", { method: "POST", body: JSON.stringify(candidate) });
      setSuccess("Solicitud registrada. Estamos consultando el buró crediticio en segundo plano.");
      setValues(EMPTY);
      setDocs([]);
      setTouched({});
      onCreated();
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  /** Campo de texto con su etiqueta, ayuda y mensaje de error. */
  const text = (
    field: keyof Values,
    label: string,
    opts: { type?: string; inputMode?: "decimal" | "tel"; hint?: string } = {},
  ) => (
    <label>
      {label}
      <input
        type={opts.type}
        inputMode={opts.inputMode}
        value={values[field]}
        onChange={set(field)}
        onBlur={blur(field)}
      />
      {opts.hint && <span className="hint">{opts.hint}</span>}
      {show(field) && <span className="field-error">{show(field)}</span>}
    </label>
  );

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <h2>Nueva solicitud de desembolso</h2>
      <p className="muted">
        Reúne estos datos del cliente antes de registrar la solicitud. Todos son obligatorios: el analista los necesita para decidir.
      </p>

      <fieldset className="section">
        <legend>Datos del cliente</legend>
        <div className="grid">
          {text("applicantName", "Nombre del cliente")}
          <label>
            Documento de identidad
            <input value={values.documentId} onChange={set("documentId")} onBlur={blur("documentId")} />
            {show("documentId") && <span className="field-error">{show("documentId")}</span>}
            {eligibility.state === "checking" && <span className="hint">Verificando historial…</span>}
            {eligibility.state === "blocked" && <span className="field-error">{eligibility.reason}</span>}
          </label>
          {text("birthDate", "Fecha de nacimiento", { type: "date" })}
          {text("phone", "Teléfono del cliente", { inputMode: "tel", hint: "8 dígitos, por ejemplo 5555-1234" })}
          {text("address", "Dirección de residencia")}
        </div>
      </fieldset>

      <fieldset className="section">
        <legend>Trabajo e ingresos</legend>
        <div className="grid">
          {text("employerName", "Empresa o negocio donde trabaja")}
          {text("jobTitle", "Puesto u ocupación")}
          <label>
            Tipo de ingreso
            <select value={values.incomeType} onChange={set("incomeType")} onBlur={blur("incomeType")}>
              <option value="">Selecciona una opción</option>
              {INCOME_TYPES.map((t) => (
                <option key={t} value={t}>
                  {INCOME_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
            {show("incomeType") && <span className="field-error">{show("incomeType")}</span>}
          </label>
          <label>
            Tiempo en su trabajo actual
            <select
              value={values.employmentTenure}
              onChange={set("employmentTenure")}
              onBlur={blur("employmentTenure")}
            >
              <option value="">Selecciona una opción</option>
              {EMPLOYMENT_TENURES.map((t) => (
                <option key={t} value={t}>
                  {TENURE_LABEL[t]}
                </option>
              ))}
            </select>
            <span className="hint">Debe poder respaldarse con una constancia laboral.</span>
            {show("employmentTenure") && <span className="field-error">{show("employmentTenure")}</span>}
          </label>
          {text("monthlyIncome", "Ingreso mensual declarado (GTQ)", { inputMode: "decimal" })}
          {text("otherIncome", "Otros ingresos mensuales (GTQ)", { inputMode: "decimal", hint: "Escribe 0 si no tiene." })}
          {text("monthlyExpenses", "Gastos mensuales (GTQ)", { inputMode: "decimal" })}
          {text("currentDebtPayment", "Cuotas de deudas actuales (GTQ)", {
            inputMode: "decimal",
            hint: "Suma de las cuotas mensuales. Escribe 0 si no tiene deudas.",
          })}
        </div>
      </fieldset>

      <fieldset className="section">
        <legend>Crédito solicitado</legend>
        <div className="grid">
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
          {text("purpose", "Destino del crédito", { hint: "Para qué usará el dinero." })}
          {text("guarantee", "Garantía que ofrece", { hint: "Por ejemplo fiador, hipoteca o aportaciones." })}
        </div>
      </fieldset>

      <fieldset className="section">
        <legend>Referencias</legend>
        <div className="grid">
          {text("reference1Name", "Referencia 1: nombre")}
          {text("reference1Phone", "Referencia 1: teléfono", { inputMode: "tel" })}
          {text("reference2Name", "Referencia 2: nombre")}
          {text("reference2Phone", "Referencia 2: teléfono", { inputMode: "tel" })}
        </div>
      </fieldset>

      <fieldset className="section">
        <legend>Documentos que entregó el cliente</legend>
        <span className="hint">Marca cada documento que ya recibiste. Los {CLIENT_DOCUMENTS.length} son obligatorios.</span>
        <div className="checks">
          {CLIENT_DOCUMENTS.map((d) => (
            <label key={d} className="check-row">
              <input type="checkbox" checked={docs.includes(d)} onChange={() => toggleDoc(d)} />
              {CLIENT_DOCUMENT_LABEL[d]}
            </label>
          ))}
        </div>
        {show("receivedDocuments") && <span className="field-error">{show("receivedDocuments")}</span>}
      </fieldset>

      {amountCents > 0 && !errors.amount && <AmortizationTable principalCents={amountCents} termMonths={candidate.termMonths} />}

      {serverError && <p className="alert error">{serverError}</p>}
      {success && <p className="alert success">{success}</p>}

      <button type="submit" className="primary" disabled={!canSubmit}>
        {submitting ? "Enviando…" : "Confirmar y enviar solicitud"}
      </button>
    </form>
  );
}
