import type { RequestDTO } from "@/server/services/workflow";
import type { AuditView } from "@/server/services/audit";

export type { RequestDTO, AuditView };

export interface BudgetDTO {
  initialCents: number;
  availableCents: number;
  committedCents: number;
  updatedAt: string;
}
