import { describe, expect, it } from "vitest";
import { CURRENCY_CODE, formatMoney, fromCents, toCents } from "@/domain/money";

describe("Dinero en quetzales", () => {
  it("muestra el importe con el símbolo Q, miles con coma y siempre dos decimales", () => {
    expect(formatMoney(5_000_000)).toBe("Q50,000.00");
    expect(formatMoney(123_456)).toBe("Q1,234.56");
    expect(formatMoney(99)).toBe("Q0.99");
    expect(formatMoney(0)).toBe("Q0.00");
    expect(formatMoney(100_000_000_00)).toBe("Q100,000,000.00");
  });

  it("pone el signo negativo antes del símbolo", () => {
    expect(formatMoney(-1_050)).toBe("-Q10.50");
  });

  it("no hay conversión: los centavos de la BD son los mismos y la moneda es GTQ", () => {
    expect(CURRENCY_CODE).toBe("GTQ");
    expect(toCents(1234.56)).toBe(123_456);
    expect(fromCents(123_456)).toBe(1234.56);
  });
});
