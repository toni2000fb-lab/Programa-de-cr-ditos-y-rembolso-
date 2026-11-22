import { buildAmortizationSchedule } from "./amortization";
import { formatMoney } from "./money";
import { exceedsDebtLimit, maxAllowedAmountCents, MAX_DEBT_RATIO } from "./rules";
import { PENDING_STATUSES, type RequestStatusValue } from "./stateMachine";

/**
 * Resumen que ve el analista para decidir. Reúne en un solo lugar las mismas condiciones que el
 * servidor exige al aprobar (en revisión, buró completado, presupuesto suficiente) y las cifras del
 * crédito. No decide nada: la aprobación sigue siendo del analista y el servidor vuelve a validar todo.
 */

type BureauStatusName = "NO_CONSULTADO" | "CONSULTANDO" | "COMPLETADO" | "FALLIDO";

export type CheckStatus = "ok" | "fail" | "pending" | "na";

export interface Check {
  id: "stage" | "limit" | "budget" | "bureau";
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface EvaluationInput {
  status: RequestStatusValue;
  amountCents: number;
  monthlyIncomeCents: number;
  termMonths: number;
  bureauStatus: BureauStatusName;
  bureauScore: number | null;
  bureauAttempts: number;
  availableBudgetCents: number;
}

export interface Financials {
  /** Monto máximo que permite la regla del 40 % para este ingreso. */
  maxAllowedCents: number;
  /** Monto solicitado como porcentaje del ingreso mensual, con un decimal. */
  amountToIncomePct: number;
  monthlyPaymentCents: number;
  /** Cuota mensual estimada como porcentaje del ingreso mensual, con un decimal. */
  paymentToIncomePct: number;
  totalInterestCents: number;
  totalPaidCents: number;
}

export interface Evaluation {
  financials: Financials;
  checks: Check[];
  /** Solo es verdadero con la solicitud en revisión y todas las condiciones cumplidas. */
  canApprove: boolean;
  /** Nombre de cada condición que falta o falla, para explicar por qué todavía no se puede aprobar. */
  blockers: string[];
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

export function computeFinancials(input: Pick<EvaluationInput, "amountCents" | "monthlyIncomeCents" | "termMonths">): Financials {
  const schedule = buildAmortizationSchedule(input.amountCents, input.termMonths);
  return {
    maxAllowedCents: maxAllowedAmountCents(input.monthlyIncomeCents),
    amountToIncomePct: pct(input.amountCents, input.monthlyIncomeCents),
    monthlyPaymentCents: schedule.monthlyPaymentCents,
    paymentToIncomePct: pct(schedule.monthlyPaymentCents, input.monthlyIncomeCents),
    totalInterestCents: schedule.totalInterestCents,
    totalPaidCents: schedule.totalPaidCents,
  };
}

function bureauCheck(input: EvaluationInput): Pick<Check, "status" | "detail"> {
  switch (input.bureauStatus) {
    case "COMPLETADO":
      return { status: "ok", detail: `Consulta completada, puntaje ${input.bureauScore ?? "sin dato"}` };
    case "FALLIDO":
      return {
        status: "fail",
        detail: `La consulta falló tras ${input.bureauAttempts} ${input.bureauAttempts === 1 ? "intento" : "intentos"}, hay que reintentarla`,
      };
    case "CONSULTANDO":
      return { status: "pending", detail: "Consultando al buró…" };
    case "NO_CONSULTADO":
      return { status: "pending", detail: "Todavía no se ha consultado" };
  }
}

export function evaluateRequest(input: EvaluationInput): Evaluation {
  const open = PENDING_STATUSES.includes(input.status);
  const financials = computeFinancials(input);
  const limitPct = Math.round(MAX_DEBT_RATIO * 100);

  const stage: Check = {
    id: "stage",
    label: "Revisión del analista",
    ...(input.status === "EN_REVISION"
      ? { status: "ok", detail: "La solicitud está en revisión" }
      : input.status === "CREADA"
        ? { status: "pending", detail: "Falta tomarla en revisión para poder decidir" }
        : { status: "na", detail: "La solicitud ya fue resuelta" }),
  };

  const limit: Check = {
    id: "limit",
    label: `Monto dentro del ${limitPct} % del ingreso`,
    ...(exceedsDebtLimit(input.amountCents, input.monthlyIncomeCents)
      ? { status: "fail", detail: `Supera el máximo de ${formatMoney(financials.maxAllowedCents)}` }
      : {
          status: "ok",
          detail: `Pide el ${financials.amountToIncomePct} % del ingreso mensual, máximo ${formatMoney(financials.maxAllowedCents)}`,
        }),
  };

  const budget: Check = {
    id: "budget",
    label: "Presupuesto disponible",
    ...(!open
      ? { status: "na", detail: "Ya no aplica: la solicitud está resuelta" }
      : input.availableBudgetCents >= input.amountCents
        ? {
            status: "ok",
            detail: `Disponible ${formatMoney(input.availableBudgetCents)}, solicita ${formatMoney(input.amountCents)}`,
          }
        : {
            status: "fail",
            detail: `Insuficiente: disponible ${formatMoney(input.availableBudgetCents)}, solicita ${formatMoney(input.amountCents)}`,
          }),
  };

  const bureau: Check = { id: "bureau", label: "Consulta al buró de crédito", ...bureauCheck(input) };

  const checks = [stage, limit, budget, bureau];
  const canApprove = input.status === "EN_REVISION" && checks.every((c) => c.status === "ok");
  const blockers = open ? checks.filter((c) => c.status === "fail" || c.status === "pending").map((c) => c.label) : [];

  return { financials, checks, canApprove, blockers };
}
