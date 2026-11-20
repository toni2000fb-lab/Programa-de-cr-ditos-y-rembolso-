-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SOLICITANTE', 'ANALISTA');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('CREADA', 'EN_REVISION', 'APROBADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "BureauStatus" AS ENUM ('NO_CONSULTADO', 'CONSULTANDO', 'COMPLETADO', 'FALLIDO');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_requests" (
    "id" UUID NOT NULL,
    "applicant_name" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "monthly_income_cents" INTEGER NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "term_months" INTEGER NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'CREADA',
    "rejection_reason" TEXT,
    "decided_at" TIMESTAMP(3),
    "bureau_status" "BureauStatus" NOT NULL DEFAULT 'NO_CONSULTADO',
    "bureau_score" INTEGER,
    "bureau_attempts" INTEGER NOT NULL DEFAULT 0,
    "bureau_checked_at" TIMESTAMP(3),
    "bureau_error" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "request_id" UUID NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_role" "Role" NOT NULL,
    "from_status" "RequestStatus",
    "to_status" "RequestStatus" NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget" (
    "id" INTEGER NOT NULL,
    "initial_cents" INTEGER NOT NULL,
    "available_cents" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "key" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "request_id" UUID NOT NULL,
    "status_code" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "credit_requests_document_id_created_at_idx" ON "credit_requests"("document_id", "created_at");

-- CreateIndex
CREATE INDEX "credit_requests_created_by_id_idx" ON "credit_requests"("created_by_id");

-- CreateIndex
CREATE INDEX "audit_logs_request_id_idx" ON "audit_logs"("request_id");

-- AddForeignKey
ALTER TABLE "credit_requests" ADD CONSTRAINT "credit_requests_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "credit_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Garantías a nivel de base de datos (defensa en profundidad)
-- ---------------------------------------------------------------------------

-- El presupuesto nunca puede quedar negativo.
ALTER TABLE "budget" ADD CONSTRAINT "budget_available_non_negative" CHECK ("available_cents" >= 0);

-- Reglas básicas de la solicitud.
ALTER TABLE "credit_requests" ADD CONSTRAINT "credit_requests_term_valid" CHECK ("term_months" IN (6, 12, 24, 36));
ALTER TABLE "credit_requests" ADD CONSTRAINT "credit_requests_amount_positive" CHECK ("amount_cents" > 0 AND "monthly_income_cents" > 0);
ALTER TABLE "credit_requests" ADD CONSTRAINT "credit_requests_debt_limit" CHECK ("amount_cents"::bigint * 10 <= "monthly_income_cents"::bigint * 4);
ALTER TABLE "credit_requests" ADD CONSTRAINT "credit_requests_rejection_reason" CHECK (
  "status" <> 'RECHAZADA' OR char_length(btrim(coalesce("rejection_reason", ''))) >= 15
);

-- El registro de auditoría es inmutable: sólo se permiten INSERT.
CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs es inmutable: % no está permitido', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();

CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_immutable();
