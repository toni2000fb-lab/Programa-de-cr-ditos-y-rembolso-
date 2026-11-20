import type { Role } from "@prisma/client";

export interface Actor {
  id: string;
  name: string;
  role: Role;
}
