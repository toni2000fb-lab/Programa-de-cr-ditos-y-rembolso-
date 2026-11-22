/**
 * Nombre con el que se muestra cada rol. El valor SOLICITANTE de la base de datos se conserva por
 * dentro, pero a quien registra las solicitudes se le llama asesor de crédito: el solicitante del
 * crédito es el cliente, no la persona que usa el sistema.
 */
export type RoleValue = "SOLICITANTE" | "ANALISTA";

export const ROLE_LABEL: Readonly<Record<RoleValue, string>> = {
  SOLICITANTE: "Asesor de crédito",
  ANALISTA: "Analista",
};

/** Página de inicio de cada rol. */
export const ROLE_HOME: Readonly<Record<RoleValue, string>> = {
  SOLICITANTE: "/asesor",
  ANALISTA: "/analista",
};
