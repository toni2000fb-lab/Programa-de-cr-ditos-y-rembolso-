import { describe, expect, it } from "vitest";
import { ROLE_HOME, ROLE_LABEL } from "@/domain/roles";

describe("Nombres de los roles", () => {
  it("quien registra las solicitudes se muestra como asesor de crédito, no como solicitante", () => {
    expect(ROLE_LABEL.SOLICITANTE).toBe("Asesor de crédito");
    expect(ROLE_LABEL.ANALISTA).toBe("Analista");
    expect(Object.values(ROLE_LABEL).join(" ")).not.toMatch(/solicitante/i);
  });

  it("cada rol entra a su propia página", () => {
    expect(ROLE_HOME).toEqual({ SOLICITANTE: "/asesor", ANALISTA: "/analista" });
  });
});
