import { describe, expect, it } from "vitest";
import {
  EMPLOYMENT_TENURES,
  PRIORITIES,
  PRIORITY_LABEL,
  priorityFromTenure,
  priorityRank,
  TENURE_LABEL,
} from "@/domain/priority";

describe("Prioridad según la antigüedad en el trabajo actual", () => {
  it("menos de 1 año es baja, de 1 a menos de 3 años es media y 3 años o más es alta", () => {
    expect(priorityFromTenure("MENOS_DE_1_ANIO")).toBe("BAJA");
    expect(priorityFromTenure("DE_1_A_3_ANIOS")).toBe("MEDIA");
    expect(priorityFromTenure("TRES_ANIOS_O_MAS")).toBe("ALTA");
  });

  it("una solicitud sin antigüedad (anterior a este dato) no tiene prioridad", () => {
    expect(priorityFromTenure(null)).toBeNull();
    expect(priorityFromTenure(undefined)).toBeNull();
  });

  it("ordena alta, media, baja y sin dato", () => {
    expect(priorityRank("ALTA")).toBeGreaterThan(priorityRank("MEDIA"));
    expect(priorityRank("MEDIA")).toBeGreaterThan(priorityRank("BAJA"));
    expect(priorityRank("BAJA")).toBeGreaterThan(priorityRank(null));
  });

  it("cada opción tiene su texto en español y cubre una prioridad distinta", () => {
    expect(EMPLOYMENT_TENURES.map((t) => TENURE_LABEL[t])).toEqual([
      "Menos de 1 año",
      "De 1 a menos de 3 años",
      "3 años o más",
    ]);
    expect(PRIORITIES.map((p) => PRIORITY_LABEL[p])).toEqual(["Alta", "Media", "Baja"]);
    expect(new Set(EMPLOYMENT_TENURES.map(priorityFromTenure)).size).toBe(3);
  });
});
