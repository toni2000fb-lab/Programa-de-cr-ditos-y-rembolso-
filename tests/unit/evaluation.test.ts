import { describe, expect, it } from "vitest";
import { buildAmortizationSchedule } from "@/domain/amortization";
import { computeFinancials, evaluateRequest, type EvaluationInput } from "@/domain/evaluation";

// Ingreso Q3,000.00 y pide Q1,000.00 a 12 meses: dentro del 40 %.
const base: EvaluationInput = {
  status: "EN_REVISION",
  amountCents: 100_000,
  monthlyIncomeCents: 300_000,
  termMonths: 12,
  bureauStatus: "COMPLETADO",
  bureauScore: 712,
  bureauAttempts: 1,
  availableBudgetCents: 5_000_000,
};
const check = (e: ReturnType<typeof evaluateRequest>, id: string) => e.checks.find((c) => c.id === id)!;

describe("Cifras del crédito", () => {
  it("calcula el porcentaje sobre el ingreso, la cuota y el total a pagar", () => {
    const f = computeFinancials(base);
    const schedule = buildAmortizationSchedule(100_000, 12);
    expect(f.maxAllowedCents).toBe(120_000);
    expect(f.amountToIncomePct).toBe(33.3);
    expect(f.monthlyPaymentCents).toBe(schedule.monthlyPaymentCents);
    expect(f.paymentToIncomePct).toBe(Math.round((schedule.monthlyPaymentCents / 300_000) * 1000) / 10);
    expect(f.totalInterestCents).toBe(schedule.totalInterestCents);
    expect(f.totalPaidCents).toBe(100_000 + schedule.totalInterestCents);
  });

  it("no divide entre cero si el ingreso fuera cero", () => {
    expect(computeFinancials({ ...base, monthlyIncomeCents: 0 }).amountToIncomePct).toBe(0);
  });
});

describe("Verificación para aprobar", () => {
  it("una solicitud en revisión con todo en orden se puede aprobar", () => {
    const e = evaluateRequest(base);
    expect(e.checks.map((c) => c.status)).toEqual(["ok", "ok", "ok", "ok"]);
    expect(e.canApprove).toBe(true);
    expect(e.blockers).toEqual([]);
    expect(check(e, "limit").detail).toBe("Pide el 33.3 % del ingreso mensual, máximo Q1,200.00");
    expect(check(e, "bureau").detail).toBe("Consulta completada, puntaje 712");
    expect(check(e, "budget").detail).toBe("Disponible Q50,000.00, solicita Q1,000.00");
  });

  it("recién creada no se puede aprobar hasta tomarla en revisión", () => {
    const e = evaluateRequest({ ...base, status: "CREADA" });
    expect(check(e, "stage")).toMatchObject({ status: "pending", detail: "Falta tomarla en revisión para poder decidir" });
    expect(e.canApprove).toBe(false);
    expect(e.blockers).toEqual(["Revisión del analista"]);
  });

  it("el buró en curso o fallido lo impide y se explica", () => {
    const consulting = evaluateRequest({ ...base, bureauStatus: "CONSULTANDO", bureauScore: null });
    expect(check(consulting, "bureau").status).toBe("pending");
    expect(consulting.canApprove).toBe(false);
    expect(consulting.blockers).toEqual(["Consulta al buró de crédito"]);

    const failed = evaluateRequest({ ...base, bureauStatus: "FALLIDO", bureauScore: null, bureauAttempts: 3 });
    expect(check(failed, "bureau")).toMatchObject({
      status: "fail",
      detail: "La consulta falló tras 3 intentos, hay que reintentarla",
    });
    expect(evaluateRequest({ ...base, bureauStatus: "FALLIDO", bureauScore: null, bureauAttempts: 1 }).checks[3]!.detail).toContain("1 intento,");
  });

  it("sin presupuesto suficiente no se puede aprobar, pero justo el monto exacto sí", () => {
    const short = evaluateRequest({ ...base, availableBudgetCents: 99_999 });
    expect(check(short, "budget")).toMatchObject({
      status: "fail",
      detail: "Insuficiente: disponible Q999.99, solicita Q1,000.00",
    });
    expect(short.canApprove).toBe(false);
    expect(short.blockers).toEqual(["Presupuesto disponible"]);
    expect(evaluateRequest({ ...base, availableBudgetCents: 100_000 }).canApprove).toBe(true);
  });

  it("marca el incumplimiento de la regla del 40 %", () => {
    const e = evaluateRequest({ ...base, amountCents: 120_001 });
    expect(check(e, "limit")).toMatchObject({ status: "fail", detail: "Supera el máximo de Q1,200.00" });
    expect(e.canApprove).toBe(false);
    expect(e.blockers).toEqual(["Monto dentro del 40 % del ingreso"]);
  });

  it("una solicitud ya resuelta no pide nada: el presupuesto y la revisión no aplican", () => {
    for (const status of ["APROBADA", "RECHAZADA"] as const) {
      const e = evaluateRequest({ ...base, status });
      expect(check(e, "stage").status).toBe("na");
      expect(check(e, "budget").status).toBe("na");
      expect(e.canApprove).toBe(false);
      expect(e.blockers).toEqual([]);
    }
  });
});
