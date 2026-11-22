/** Datos del cliente válidos, tal como los manda el formulario (importes en quetzales). */
export const ALL_DOCUMENTS = ["COPIA_DPI", "COMPROBANTE_DOMICILIO", "CONSTANCIA_LABORAL", "COMPROBANTE_INGRESOS"] as const;

export function clientProfileInput(overrides: Record<string, unknown> = {}) {
  return {
    birthDate: "1990-05-10",
    phone: "5555-1234",
    address: "5a avenida 10-20, zona 1, Guatemala",
    employerName: "Comercial Los Pinos",
    jobTitle: "Contador",
    incomeType: "PLANILLA",
    otherIncome: 0,
    monthlyExpenses: 1200,
    currentDebtPayment: 0,
    purpose: "Reparar la casa",
    guarantee: "Fiador",
    reference1Name: "María López",
    reference1Phone: "5555-0001",
    reference2Name: "Carlos Pérez",
    reference2Phone: "5555-0002",
    receivedDocuments: [...ALL_DOCUMENTS],
    ...overrides,
  };
}
