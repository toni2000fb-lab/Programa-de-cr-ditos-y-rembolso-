import { MONTHLY_INTEREST_RATE } from "./rules";

export interface AmortizationRow {
  month: number;
  paymentCents: number;
  interestCents: number;
  principalCents: number;
  balanceCents: number;
}

export interface AmortizationSchedule {
  monthlyPaymentCents: number;
  totalInterestCents: number;
  totalPaidCents: number;
  rows: AmortizationRow[];
}

/**
 * Tabla de amortización con cuota fija (sistema francés) y tasa de interés fija mensual.
 * Cuota = P · r / (1 − (1 + r)^−n). La última cuota se ajusta para dejar el saldo en 0
 * y absorber los redondeos a centavos.
 */
export function buildAmortizationSchedule(
  principalCents: number,
  termMonths: number,
  monthlyRate: number = MONTHLY_INTEREST_RATE,
): AmortizationSchedule {
  if (!Number.isInteger(principalCents) || principalCents <= 0) {
    return { monthlyPaymentCents: 0, totalInterestCents: 0, totalPaidCents: 0, rows: [] };
  }
  if (!Number.isInteger(termMonths) || termMonths <= 0) {
    throw new Error("El plazo debe ser un entero positivo");
  }

  const payment =
    monthlyRate === 0
      ? principalCents / termMonths
      : (principalCents * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths));
  const paymentCents = Math.round(payment);

  const rows: AmortizationRow[] = [];
  let balance = principalCents;
  let totalInterest = 0;
  let totalPaid = 0;

  for (let month = 1; month <= termMonths; month++) {
    const interestCents = Math.round(balance * monthlyRate);
    let principalPart = paymentCents - interestCents;
    let rowPayment = paymentCents;
    if (month === termMonths || principalPart > balance) {
      principalPart = balance;
      rowPayment = principalPart + interestCents;
    }
    balance -= principalPart;
    totalInterest += interestCents;
    totalPaid += rowPayment;
    rows.push({
      month,
      paymentCents: rowPayment,
      interestCents,
      principalCents: principalPart,
      balanceCents: balance,
    });
  }

  return {
    monthlyPaymentCents: paymentCents,
    totalInterestCents: totalInterest,
    totalPaidCents: totalPaid,
    rows,
  };
}
