import { describe, expect, it } from "vitest";
import { createRequestSchema, exceedsDebtLimit, rejectSchema } from "@/domain/rules";
import { canTransition } from "@/domain/stateMachine";

const valid = { applicantName: "Ana Torres", documentId: "abc12345", monthlyIncome: 3000, amount: 1200, termMonths: 12 };

describe("Regla del 40% de endeudamiento", () => {
  it("acepta exactamente el 40% y rechaza un centavo más", () => {
    expect(exceedsDebtLimit(120_000, 300_000)).toBe(false);
    expect(exceedsDebtLimit(120_001, 300_000)).toBe(true);
  });

  it("el esquema compartido rechaza montos por encima del límite con un mensaje claro", () => {
    const r = createRequestSchema.safeParse({ ...valid, amount: 1200.01 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["amount"]);
    expect(r.error?.issues[0]?.message).toContain("40%");
  });

  it("normaliza el documento y valida los plazos permitidos", () => {
    const ok = createRequestSchema.parse(valid);
    expect(ok.documentId).toBe("ABC12345");
    for (const term of [6, 12, 24, 36]) expect(createRequestSchema.safeParse({ ...valid, termMonths: term }).success).toBe(true);
    expect(createRequestSchema.safeParse({ ...valid, termMonths: 18 }).success).toBe(false);
  });
});

describe("Motivo de rechazo", () => {
  it("exige al menos 15 caracteres sin contar espacios exteriores", () => {
    expect(rejectSchema.safeParse({ reason: "   muy corto    " }).success).toBe(false);
    expect(rejectSchema.safeParse({ reason: "Ingresos no verificables" }).success).toBe(true);
  });
});

describe("Máquina de estados", () => {
  it("sólo permite CREADA → EN_REVISION → APROBADA|RECHAZADA", () => {
    expect(canTransition("CREADA", "EN_REVISION")).toBe(true);
    expect(canTransition("EN_REVISION", "APROBADA")).toBe(true);
    expect(canTransition("EN_REVISION", "RECHAZADA")).toBe(true);
    expect(canTransition("CREADA", "APROBADA")).toBe(false); // salto
    expect(canTransition("RECHAZADA", "APROBADA")).toBe(false); // reversión
    expect(canTransition("APROBADA", "EN_REVISION")).toBe(false);
  });
});
