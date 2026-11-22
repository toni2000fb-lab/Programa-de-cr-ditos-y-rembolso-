import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getRequestDetail } from "@/server/services/request-detail";
import { analista, db, requestInReview, seedActors, setBudget, solicitante, uniqueDoc } from "./helpers";

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

    const d = await getRequestDetail(db, analista, id);
    expect(d.request.id).toBe(id);
    expect(d.request.createdByName).toBe(solicitante.name);
    expect(d.createdBy).toEqual({ id: solicitante.id, name: solicitante.name, role: "SOLICITANTE" });
    expect(d.availableBudgetCents).toBe(777_700);
    // Del más antiguo al más reciente.
    expect(d.audit.map((a) => a.toStatus)).toEqual(["CREADA", "EN_REVISION"]);
    expect(d.audit.map((a) => a.id)).toEqual([...d.audit.map((a) => a.id)].sort((a, b) => a - b));
  });

  it("incluye los datos del cliente que reunió el asesor, con importes en centavos", async () => {
    const id = await requestInReview(1_000);
    const { profile } = await getRequestDetail(db, analista, id);
    expect(profile).toEqual({
      birthDate: "1990-05-10",
      phone: "55551234",
      address: "5a avenida 10-20, zona 1, Guatemala",
      employerName: "Comercial Los Pinos",
      jobTitle: "Contador",
      incomeType: "PLANILLA",
      otherIncomeCents: 0,
      monthlyExpensesCents: 120_000,
      currentDebtPaymentCents: 0,
      purpose: "Reparar la casa",
      guarantee: "Fiador",
      references: [
        { name: "María López", phone: "55550001" },
        { name: "Carlos Pérez", phone: "55550002" },
      ],
      receivedDocuments: ["COPIA_DPI", "COMPROBANTE_DOMICILIO", "CONSTANCIA_LABORAL", "COMPROBANTE_INGRESOS"],
    });
  });

  it("una solicitud anterior a que se pidieran esos datos devuelve el perfil en nulo", async () => {
    const legacy = await db.creditRequest.create({
      data: {
        applicantName: "Cliente Anterior",
        documentId: uniqueDoc(),
        monthlyIncomeCents: 300_000,
        amountCents: 100_000,
        termMonths: 12,
        createdById: solicitante.id,
      },
    });
    const d = await getRequestDetail(db, analista, legacy.id);
    expect(d.profile).toBeNull();
    expect(d.request.id).toBe(legacy.id);
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
