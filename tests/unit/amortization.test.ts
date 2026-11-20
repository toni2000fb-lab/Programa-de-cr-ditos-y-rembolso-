import { describe, expect, it } from "vitest";
import { buildAmortizationSchedule } from "@/domain/amortization";

describe("Tabla de amortización (1.5% mensual, cuota fija)", () => {
  it("calcula la cuota del sistema francés y amortiza el capital completo", () => {
    const s = buildAmortizationSchedule(1_000_000, 12); // $10,000 a 12 meses
    // P·r/(1−(1+r)^−n) = 916.80
    expect(s.monthlyPaymentCents).toBe(91_680);
    expect(s.rows).toHaveLength(12);
    expect(s.rows[0]?.interestCents).toBe(15_000); // 1.5% de 10,000
    expect(s.rows.at(-1)?.balanceCents).toBe(0);
    const principal = s.rows.reduce((acc, r) => acc + r.principalCents, 0);
    expect(principal).toBe(1_000_000);
    expect(s.totalPaidCents).toBe(1_000_000 + s.totalInterestCents);
  });
});
