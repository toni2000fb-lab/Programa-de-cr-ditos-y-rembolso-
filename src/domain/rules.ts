import { z } from "zod";
import { clientProfileShape, referenceIssues } from "./clientProfile";
import { formatMoney, MAX_MONEY } from "./money";
import { EMPLOYMENT_TENURES } from "./priority";

/** Reglas de negocio compartidas por frontend y backend. */
export const ALLOWED_TERMS = [6, 12, 24, 36] as const;
export type TermMonths = (typeof ALLOWED_TERMS)[number];

export const MAX_DEBT_RATIO = 0.4;
export const MONTHLY_INTEREST_RATE = 0.015;
export const HISTORY_WINDOW_DAYS = 30;
export const MIN_REJECTION_REASON_LENGTH = 15;
export const INITIAL_BUDGET_CENTS = 5_000_000; // Q50,000.00
/** Una consulta de buró sin avanzar durante este tiempo se considera atascada y puede relanzarse. */
export const BUREAU_STALE_MS = 60_000;

/** Regla del 40%: el monto solicitado no puede superar el 40% del ingreso mensual. */
export function exceedsDebtLimit(amountCents: number, monthlyIncomeCents: number): boolean {
  // Aritmética entera: amount <= income * 0.4  <=>  amount * 10 <= income * 4
  return amountCents * 10 > monthlyIncomeCents * 4;
}

export function maxAllowedAmountCents(monthlyIncomeCents: number): number {
  return Math.floor((monthlyIncomeCents * 4) / 10);
}

const money = (label: string) =>
  z
    .number({ error: `${label} debe ser un número` })
    .finite({ error: `${label} debe ser un número` })
    .positive({ error: `${label} debe ser mayor que 0` })
    .max(MAX_MONEY, { error: `${label} excede el máximo permitido` })
    .refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, {
      error: `${label} admite como máximo 2 decimales`,
    });

/** Esquema de creación (importes en quetzales, tal como los introduce el usuario). */
export const createRequestSchema = z
  .object({
    applicantName: z
      .string({ error: "El nombre es obligatorio" })
      .trim()
      .min(3, { error: "El nombre debe tener al menos 3 caracteres" })
      .max(120, { error: "El nombre es demasiado largo" }),
    documentId: z
      .string({ error: "El documento es obligatorio" })
      .trim()
      .regex(/^[A-Za-z0-9-]{5,20}$/, {
        error: "El documento debe tener entre 5 y 20 caracteres alfanuméricos",
      })
      .transform((v) => v.toUpperCase()),
    monthlyIncome: money("El ingreso mensual"),
    amount: money("El monto solicitado"),
    employmentTenure: z.enum(EMPLOYMENT_TENURES, {
      error: "Indica cuánto tiempo lleva en su trabajo actual",
    }),
    termMonths: z
      .number({ error: "El plazo es obligatorio" })
      .refine((v): v is TermMonths => (ALLOWED_TERMS as readonly number[]).includes(v), {
        error: "El plazo debe ser 6, 12, 24 o 36 meses",
      }),
    ...clientProfileShape,
  })
  .superRefine((data, ctx) => {
    for (const issue of referenceIssues(data)) {
      ctx.addIssue({ code: "custom", path: [issue.path], message: issue.message });
    }
    const amountCents = Math.round(data.amount * 100);
    const incomeCents = Math.round(data.monthlyIncome * 100);
    if (exceedsDebtLimit(amountCents, incomeCents)) {
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: `El monto solicitado no puede superar el 40% del ingreso mensual declarado (máximo ${formatMoney(
          maxAllowedAmountCents(incomeCents),
        )})`,
      });
    }
  });

export type CreateRequestInput = z.infer<typeof createRequestSchema>;

export const rejectSchema = z.object({
  reason: z
    .string({ error: "El motivo de rechazo es obligatorio" })
    .trim()
    .min(MIN_REJECTION_REASON_LENGTH, {
      error: `El motivo de rechazo debe tener al menos ${MIN_REJECTION_REASON_LENGTH} caracteres`,
    })
    .max(1000, { error: "El motivo de rechazo es demasiado largo" }),
});

export const approveSchema = z.object({
  comment: z.string().trim().max(1000).optional(),
});

export const reviewSchema = z.object({
  comment: z.string().trim().max(1000).optional(),
});
