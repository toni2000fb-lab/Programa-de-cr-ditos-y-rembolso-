import { describe, expect, it } from "vitest";
import { ageOn, CLIENT_DOCUMENTS, normalizePhone, referenceIssues } from "@/domain/clientProfile";
import { createRequestSchema } from "@/domain/rules";
import { clientProfileInput } from "../fixtures";

const base = {
  applicantName: "Ana Torres",
  documentId: "abc12345",
  employmentTenure: "DE_1_A_3_ANIOS",
  monthlyIncome: 3000,
  amount: 1200,
  termMonths: 12,
};
const parse = (overrides: Record<string, unknown> = {}) =>
  createRequestSchema.safeParse({ ...base, ...clientProfileInput(overrides) });
/** Campo y mensaje del primer problema, para comprobar que el error cae en el campo correcto. */
const firstIssue = (overrides: Record<string, unknown>) => {
  const r = parse(overrides);
  expect(r.success, JSON.stringify(overrides)).toBe(false);
  const issue = r.error?.issues[0];
  return { path: issue?.path[0], message: issue?.message ?? "" };
};

describe("Edad a partir de la fecha de nacimiento", () => {
  const today = new Date("2026-11-22T12:00:00.000Z");

  it("cuenta el cumpleaños: un día antes todavía no cumple", () => {
    expect(ageOn("2008-11-22", today)).toBe(18);
    expect(ageOn("2008-11-23", today)).toBe(17);
    expect(ageOn("2008-12-01", today)).toBe(17);
    expect(ageOn("1990-05-10", today)).toBe(36);
  });

  it("acepta el 29 de febrero de un año bisiesto y rechaza fechas que no existen", () => {
    expect(ageOn("2000-02-29", today)).toBe(26);
    expect(ageOn("2001-02-29", today)).toBeNull();
    expect(ageOn("1990-13-01", today)).toBeNull();
    expect(ageOn("1990-04-31", today)).toBeNull();
    expect(ageOn("10/05/1990", today)).toBeNull();
    expect(ageOn("", today)).toBeNull();
  });
});

describe("Teléfono", () => {
  it("deja solo los 8 dígitos, con o sin guion, espacios o prefijo +502", () => {
    expect(normalizePhone("5555-1234")).toBe("55551234");
    expect(normalizePhone("5555 1234")).toBe("55551234");
    expect(normalizePhone("+502 5555-1234")).toBe("55551234");
    expect(normalizePhone("50255551234")).toBe("55551234");
    expect(normalizePhone("555")).toBe("555");
  });
});

describe("Datos obligatorios del cliente en el esquema compartido", () => {
  it("acepta un cliente completo y deja los datos normalizados", () => {
    const r = parse({ phone: "+502 5555-1234", reference1Phone: "5555 0001" });
    expect(r.success).toBe(true);
    expect(r.data?.phone).toBe("55551234");
    expect(r.data?.reference1Phone).toBe("55550001");
    expect(r.data?.address).toBe("5a avenida 10-20, zona 1, Guatemala");
  });

  it("cada dato es obligatorio y el error cae en su propio campo", () => {
    const required = [
      "birthDate", "phone", "address", "employerName", "jobTitle", "incomeType", "otherIncome",
      "monthlyExpenses", "currentDebtPayment", "purpose", "guarantee", "reference1Name",
      "reference1Phone", "reference2Name", "reference2Phone", "receivedDocuments",
    ];
    for (const field of required) {
      const withoutField = { ...base, ...clientProfileInput() } as Record<string, unknown>;
      delete withoutField[field];
      const r = createRequestSchema.safeParse(withoutField);
      expect(r.success, field).toBe(false);
      expect(r.error?.issues.map((i) => i.path[0]), field).toContain(field);
    }
  });

  it("el cliente debe ser mayor de edad y la fecha tiene que existir", () => {
    const tooYoung = new Date();
    tooYoung.setUTCFullYear(tooYoung.getUTCFullYear() - 17);
    expect(firstIssue({ birthDate: tooYoung.toISOString().slice(0, 10) })).toEqual({
      path: "birthDate",
      message: "El cliente debe ser mayor de 18 años",
    });
    expect(firstIssue({ birthDate: "2001-02-29" }).path).toBe("birthDate");
    expect(firstIssue({ birthDate: "" })).toEqual({ path: "birthDate", message: "La fecha de nacimiento es obligatoria" });
    expect(firstIssue({ birthDate: "1900-01-01" }).path).toBe("birthDate");
    expect(parse({ birthDate: "2000-02-29" }).success).toBe(true);
  });

  it("el teléfono debe tener 8 dígitos", () => {
    for (const bad of ["", "555", "5555-12345", "abcd-efgh"]) {
      expect(firstIssue({ phone: bad }), bad).toEqual({ path: "phone", message: "El teléfono del cliente debe tener 8 dígitos" });
    }
  });

  it("otros ingresos, gastos y cuotas pueden ser cero pero no negativos ni texto", () => {
    expect(parse({ otherIncome: 0, monthlyExpenses: 0, currentDebtPayment: 0 }).success).toBe(true);
    expect(firstIssue({ monthlyExpenses: -1 })).toEqual({ path: "monthlyExpenses", message: "El valor de los gastos mensuales no puede ser negativo" });
    expect(firstIssue({ otherIncome: Number.NaN }).path).toBe("otherIncome");
    expect(firstIssue({ currentDebtPayment: "0" }).path).toBe("currentDebtPayment");
    expect(firstIssue({ otherIncome: 10.005 }).message).toContain("2 decimales");
  });

  it("el tipo de ingreso debe ser uno de la lista", () => {
    expect(parse({ incomeType: "NEGOCIO_PROPIO" }).success).toBe(true);
    expect(firstIssue({ incomeType: "REGALOS" }).path).toBe("incomeType");
  });

  it("los mensajes de campo vacío están bien redactados", () => {
    expect(firstIssue({ address: undefined }).message).toBe("Escribe la dirección");
    expect(firstIssue({ jobTitle: "" }).message).toBe("Escribe el puesto");
    expect(firstIssue({ guarantee: undefined }).message).toBe("Escribe la garantía");
    expect(firstIssue({ purpose: "abc" }).message).toBe("El destino del crédito debe tener al menos 5 caracteres");
    expect(firstIssue({ otherIncome: undefined }).message).toBe("Indica otros ingresos con un número (escribe 0 si no tiene)");
  });

  it("los textos vacíos o de solo espacios se rechazan", () => {
    for (const field of ["address", "employerName", "jobTitle", "purpose", "guarantee", "reference1Name", "reference2Name"]) {
      expect(firstIssue({ [field]: "     " }).path, field).toBe(field);
    }
  });
});

describe("Documentos que entregó el cliente", () => {
  it("deben estar marcados los cuatro", () => {
    for (const missing of CLIENT_DOCUMENTS) {
      const docs = CLIENT_DOCUMENTS.filter((d) => d !== missing);
      expect(firstIssue({ receivedDocuments: docs }), missing).toEqual({
        path: "receivedDocuments",
        message: "Marca los 4 documentos que entregó el cliente",
      });
    }
    expect(firstIssue({ receivedDocuments: [] }).path).toBe("receivedDocuments");
  });

  it("rechaza documentos que no existen y guarda cada uno una sola vez, en el orden de la lista", () => {
    expect(firstIssue({ receivedDocuments: [...CLIENT_DOCUMENTS, "PASAPORTE"] }).path).toBe("receivedDocuments");
    const r = parse({ receivedDocuments: ["COMPROBANTE_INGRESOS", "COPIA_DPI", "COPIA_DPI", "CONSTANCIA_LABORAL", "COMPROBANTE_DOMICILIO"] });
    expect(r.data?.receivedDocuments).toEqual([...CLIENT_DOCUMENTS]);
  });
});

describe("Referencias", () => {
  it("las dos deben tener teléfonos distintos y distintos al del cliente", () => {
    expect(firstIssue({ reference2Phone: "5555-0001" })).toEqual({
      path: "reference2Phone",
      message: "Las dos referencias deben tener teléfonos distintos",
    });
    expect(firstIssue({ reference1Phone: "+502 5555 1234" })).toEqual({
      path: "reference1Phone",
      message: "La referencia 1 no puede tener el mismo teléfono que el cliente",
    });
    expect(firstIssue({ reference2Phone: "55551234" }).path).toBe("reference2Phone");
  });

  it("la comprobación no falla si los teléfonos todavía no son texto válido", () => {
    expect(referenceIssues({ phone: undefined, reference1Phone: 5, reference2Phone: null })).toEqual([]);
  });

  it("no avisa de choques entre teléfonos vacíos o incompletos", () => {
    expect(referenceIssues({ phone: "", reference1Phone: "", reference2Phone: "" })).toEqual([]);
    expect(referenceIssues({ phone: "5555", reference1Phone: "5555", reference2Phone: "5555" })).toEqual([]);
  });
});
