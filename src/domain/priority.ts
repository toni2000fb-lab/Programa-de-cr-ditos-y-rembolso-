/**
 * Prioridad de atención de una solicitud. No la elige nadie: sale de una regla fija a partir del
 * tiempo que la persona lleva en su trabajo actual, que es lo que la cooperativa respalda con una
 * constancia laboral. La prioridad solo ordena la cola del analista; no cambia ninguna regla de
 * aprobación (40 % del ingreso, 30 días de historial, buró y presupuesto).
 *
 * Solo se guarda la antigüedad declarada. La prioridad se calcula al mostrarla, así que si la
 * cooperativa cambia la regla basta con editar la tabla de abajo, sin migrar datos.
 */

export const EMPLOYMENT_TENURES = ["MENOS_DE_1_ANIO", "DE_1_A_3_ANIOS", "TRES_ANIOS_O_MAS"] as const;
export type EmploymentTenureValue = (typeof EMPLOYMENT_TENURES)[number];

export const TENURE_LABEL: Readonly<Record<EmploymentTenureValue, string>> = {
  MENOS_DE_1_ANIO: "Menos de 1 año",
  DE_1_A_3_ANIOS: "De 1 a menos de 3 años",
  TRES_ANIOS_O_MAS: "3 años o más",
};

export const PRIORITIES = ["ALTA", "MEDIA", "BAJA"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABEL: Readonly<Record<Priority, string>> = {
  ALTA: "Alta",
  MEDIA: "Media",
  BAJA: "Baja",
};

/** La regla: más tiempo en el trabajo actual, más prioridad. */
const PRIORITY_BY_TENURE: Readonly<Record<EmploymentTenureValue, Priority>> = {
  MENOS_DE_1_ANIO: "BAJA",
  DE_1_A_3_ANIOS: "MEDIA",
  TRES_ANIOS_O_MAS: "ALTA",
};

/** Prioridad que corresponde a una antigüedad. Es `null` en solicitudes viejas que no la tienen. */
export function priorityFromTenure(tenure: EmploymentTenureValue | null | undefined): Priority | null {
  return tenure ? PRIORITY_BY_TENURE[tenure] : null;
}

const RANK: Readonly<Record<Priority, number>> = { ALTA: 3, MEDIA: 2, BAJA: 1 };

/** Número para ordenar: mayor es más prioritaria; sin dato queda al final. */
export function priorityRank(priority: Priority | null): number {
  return priority ? RANK[priority] : 0;
}
