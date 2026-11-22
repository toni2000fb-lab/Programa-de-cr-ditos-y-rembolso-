import { z } from "zod";
import { MAX_MONEY } from "./money";

/**
 * Datos del cliente que el asesor de crédito debe reunir antes de registrar la solicitud, para que
 * el analista tenga con qué decidir. Las reglas de aquí las usan el formulario y el servidor.
 * Ninguna cambia las reglas de aprobación (40 % del ingreso, 30 días, buró y presupuesto): son
 * información de apoyo y requisitos de registro.
 */

export const INCOME_TYPES = ["PLANILLA", "NEGOCIO_PROPIO", "OTRO"] as const;
export type IncomeTypeValue = (typeof INCOME_TYPES)[number];

export const INCOME_TYPE_LABEL: Readonly<Record<IncomeTypeValue, string>> = {
  PLANILLA: "Empleado en planilla",
  NEGOCIO_PROPIO: "Negocio propio",
  OTRO: "Otro",
};

/** Documentos que el asesor recibe del cliente. El sistema solo guarda que se recibieron, no los archivos. */
export const CLIENT_DOCUMENTS = [
  "COPIA_DPI",
  "COMPROBANTE_DOMICILIO",
  "CONSTANCIA_LABORAL",
  "COMPROBANTE_INGRESOS",
] as const;
export type ClientDocumentValue = (typeof CLIENT_DOCUMENTS)[number];

export const CLIENT_DOCUMENT_LABEL: Readonly<Record<ClientDocumentValue, string>> = {
  COPIA_DPI: "Copia del DPI",
  COMPROBANTE_DOMICILIO: "Comprobante de domicilio",
  CONSTANCIA_LABORAL: "Constancia laboral",
  COMPROBANTE_INGRESOS: "Boletas de pago o estados de cuenta",
};

/** Un crédito solo se puede otorgar a una persona mayor de edad. */
export const MIN_CLIENT_AGE = 18;
/** Tope de cordura para detectar errores al escribir el año; no es una regla de la cooperativa. */
export const MAX_CLIENT_AGE = 100;
export const PHONE_DIGITS = 8;

/** Edad cumplida en `today` para una fecha `YYYY-MM-DD`. Devuelve null si la fecha no existe. */
export function ageOn(birthDate: string, today: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  // Rechaza fechas que no existen, como 2000-02-31, que JavaScript corre al mes siguiente.
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  let age = today.getUTCFullYear() - year;
  const beforeBirthday =
    today.getUTCMonth() < month - 1 || (today.getUTCMonth() === month - 1 && today.getUTCDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}

/**
 * Deja solo los 8 dígitos del número guatemalteco. Acepta espacios, guiones y el prefijo +502,
 * así "5555-1234" y "+502 5555 1234" dan el mismo resultado.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.length === PHONE_DIGITS + 3 && digits.startsWith("502") ? digits.slice(3) : digits;
}

/** "La dirección" pasa a "la dirección" para armar frases como "Escribe la dirección". */
const lower = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);

const text = (label: string, min: number, max: number) =>
  z
    .string({ error: `Escribe ${lower(label)}` })
    .trim()
    // Primero se avisa si está vacío; después, si es demasiado corto.
    .min(1, { error: `Escribe ${lower(label)}` })
    .min(min, { error: `${label} debe tener al menos ${min} caracteres` })
    .max(max, { error: `${label} es demasiado largo` });

const phone = (label: string) =>
  z
    .string({ error: `${label} es obligatorio` })
    .transform(normalizePhone)
    .refine((v) => v.length === PHONE_DIGITS, { error: `${label} debe tener ${PHONE_DIGITS} dígitos` });

/**
 * Importes que pueden ser cero (otros ingresos, gastos, cuotas), a diferencia del monto solicitado.
 * La etiqueta va en minúscula y con su artículo, como "los gastos mensuales".
 */
const moneyOrZero = (label: string) =>
  z
    .number({ error: `Indica ${label} con un número (escribe 0 si no tiene)` })
    .finite({ error: `Indica ${label} con un número (escribe 0 si no tiene)` })
    .min(0, { error: `El valor de ${label} no puede ser negativo` })
    .max(MAX_MONEY, { error: `El valor de ${label} excede el máximo permitido` })
    .refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, {
      error: `El valor de ${label} admite como máximo 2 decimales`,
    });

/** Campos de la solicitud que describen al cliente, como los escribe el asesor (importes en quetzales). */
export const clientProfileShape = {
  birthDate: z
    .string({ error: "La fecha de nacimiento es obligatoria" })
    .min(1, { error: "La fecha de nacimiento es obligatoria" })
    .refine((v) => ageOn(v) !== null, { error: "La fecha de nacimiento no es válida" })
    .refine((v) => (ageOn(v) ?? MIN_CLIENT_AGE) >= MIN_CLIENT_AGE, {
      error: `El cliente debe ser mayor de ${MIN_CLIENT_AGE} años`,
    })
    .refine((v) => (ageOn(v) ?? 0) <= MAX_CLIENT_AGE, { error: "La fecha de nacimiento no es válida" }),
  phone: phone("El teléfono del cliente"),
  address: text("La dirección", 5, 200),
  employerName: text("El lugar de trabajo", 2, 120),
  jobTitle: text("El puesto", 2, 80),
  incomeType: z.enum(INCOME_TYPES, { error: "Indica el tipo de ingreso" }),
  otherIncome: moneyOrZero("otros ingresos"),
  monthlyExpenses: moneyOrZero("los gastos mensuales"),
  currentDebtPayment: moneyOrZero("la cuota de deudas actuales"),
  purpose: text("El destino del crédito", 5, 300),
  guarantee: text("La garantía", 3, 300),
  reference1Name: text("El nombre de la referencia 1", 3, 120),
  reference1Phone: phone("El teléfono de la referencia 1"),
  reference2Name: text("El nombre de la referencia 2", 3, 120),
  reference2Phone: phone("El teléfono de la referencia 2"),
  receivedDocuments: z
    .array(z.enum(CLIENT_DOCUMENTS), { error: "Marca los documentos que entregó el cliente" })
    .refine((docs) => CLIENT_DOCUMENTS.every((d) => docs.includes(d)), {
      error: `Marca los ${CLIENT_DOCUMENTS.length} documentos que entregó el cliente`,
    })
    // Sin repetidos, para guardar exactamente lo marcado.
    .transform((docs) => CLIENT_DOCUMENTS.filter((d) => docs.includes(d))),
};

/**
 * Las referencias deben ser dos personas distintas y ninguna puede responder en el mismo teléfono
 * del cliente. Recibe los teléfonos ya normalizados y solo compara los que están completos, para
 * no avisar de un choque entre dos campos todavía vacíos.
 */
export function referenceIssues(phones: {
  phone: unknown;
  reference1Phone: unknown;
  reference2Phone: unknown;
}): { path: "reference1Phone" | "reference2Phone"; message: string }[] {
  const complete = (v: unknown): v is string => typeof v === "string" && v.length === PHONE_DIGITS;
  const { phone: client, reference1Phone: r1, reference2Phone: r2 } = phones;
  const issues: { path: "reference1Phone" | "reference2Phone"; message: string }[] = [];
  if (complete(r1) && complete(client) && r1 === client) {
    issues.push({ path: "reference1Phone", message: "La referencia 1 no puede tener el mismo teléfono que el cliente" });
  }
  if (complete(r2) && complete(client) && r2 === client) {
    issues.push({ path: "reference2Phone", message: "La referencia 2 no puede tener el mismo teléfono que el cliente" });
  }
  if (complete(r1) && complete(r2) && r1 === r2) {
    issues.push({ path: "reference2Phone", message: "Las dos referencias deben tener teléfonos distintos" });
  }
  return issues;
}

/** Lo que el servidor devuelve al analista sobre el cliente (importes en centavos). */
export interface ClientProfileDTO {
  /** Fecha de nacimiento en formato YYYY-MM-DD. */
  birthDate: string;
  phone: string;
  address: string;
  employerName: string;
  jobTitle: string;
  incomeType: IncomeTypeValue;
  otherIncomeCents: number;
  monthlyExpensesCents: number;
  currentDebtPaymentCents: number;
  purpose: string;
  guarantee: string;
  references: { name: string; phone: string }[];
  receivedDocuments: ClientDocumentValue[];
}
