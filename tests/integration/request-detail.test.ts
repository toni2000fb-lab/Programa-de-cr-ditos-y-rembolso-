import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getRequestDetail } from "@/server/services/request-detail";
import { setUrgent } from "@/server/services/workflow";
import { analista, db, requestInReview, seedActors, setBudget, solicitante } from "./helpers";

beforeAll(seedActors);
beforeEach(() => setBudget(5_000_000));
afterAll(() => db.$disconnect());

/** Otra solicitud del mismo documento, ya resuelta (las pendientes bloquearían crear nuevas). */
async function otherRequest(documentId: string, status: "APROBADA" | "RECHAZADA", createdAt: string, amountCents: number) {
  return db.creditRequest.create({
    data: {
      applicantName: "Cliente Anterior",
      documentId,
      monthlyIncomeCents: 1_000_000, // alcanza para el 40 % de cualquier monto de estas pruebas
      amountCents,
      termMonths: 12,
      status,
      decidedAt: new Date(createdAt),
      rejectionReason: status === "RECHAZADA" ? "Ingresos no verificables" : null,
      createdById: solicitante.id,
      createdAt: new Date(createdAt),
    },
  });
}

describe("Detalle del cliente (BD real)", () => {
  it("reúne la solicitud, el asesor que la registró, la auditoría en orden y el presupuesto", async () => {
    const id = await requestInReview(1_000);
    await setBudget(777_700);
    await setUrgent(db, analista, id, true);

    const d = await getRequestDetail(db, analista, id);
    expect(d.request.id).toBe(id);
    expect(d.request.urgent).toBe(true);
    expect(d.createdBy).toEqual({ id: solicitante.id, name: solicitante.name, role: "SOLICITANTE" });
    expect(d.availableBudgetCents).toBe(777_700);
    // Del más antiguo al más reciente, y la marca de urgente también queda en el seguimiento.
    expect(d.audit.map((a) => a.comment)).toEqual([
      "Solicitud registrada",
      expect.any(String), // al tomarla en revisión
      "Marcada como urgente",
    ]);
    expect(d.audit.map((a) => a.id)).toEqual([...d.audit.map((a) => a.id)].sort((a, b) => a - b));
  });

  it("el historial trae solo las otras solicitudes del mismo documento, la más reciente primero", async () => {
    const id = await requestInReview(1_000);
    const { documentId } = await db.creditRequest.findUniqueOrThrow({ where: { id } });
    const older = await otherRequest(documentId, "RECHAZADA", "2026-03-01T10:00:00.000Z", 250_000);
    const newer = await otherRequest(documentId, "APROBADA", "2026-06-01T10:00:00.000Z", 80_000);
    await otherRequest(`${documentId}X`, "APROBADA", "2026-06-01T10:00:00.000Z", 99_000); // otro cliente

    const { history } = await getRequestDetail(db, analista, id);
    expect(history.map((h) => h.id)).toEqual([newer.id, older.id]);
    expect(history[1]).toMatchObject({ status: "RECHAZADA", amountCents: 250_000, rejectionReason: "Ingresos no verificables" });
    expect(history.map((h) => h.id)).not.toContain(id);
  });

  it("sin otras solicitudes el historial viene vacío", async () => {
    const id = await requestInReview(1_000);
    expect((await getRequestDetail(db, analista, id)).history).toEqual([]);
  });

  it("un asesor de crédito no puede pedirlo", async () => {
    const id = await requestInReview(1_000);
    await expect(getRequestDetail(db, solicitante, id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("una solicitud inexistente responde NOT_FOUND", async () => {
    await expect(getRequestDetail(db, analista, randomUUID())).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
