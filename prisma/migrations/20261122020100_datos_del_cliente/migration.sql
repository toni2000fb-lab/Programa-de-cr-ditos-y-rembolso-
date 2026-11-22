-- Datos del cliente que el asesor reúne al registrar la solicitud. Van en una tabla aparte, de modo
-- que las solicitudes anteriores simplemente no tienen perfil y la API lo exige solo al crear.
CREATE TYPE "IncomeType" AS ENUM ('PLANILLA', 'NEGOCIO_PROPIO', 'OTRO');

CREATE TYPE "ClientDocument" AS ENUM ('COPIA_DPI', 'COMPROBANTE_DOMICILIO', 'CONSTANCIA_LABORAL', 'COMPROBANTE_INGRESOS');

CREATE TABLE "client_profiles" (
    "request_id" UUID NOT NULL,
    "birth_date" DATE NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "employer_name" TEXT NOT NULL,
    "job_title" TEXT NOT NULL,
    "income_type" "IncomeType" NOT NULL,
    "other_income_cents" INTEGER NOT NULL,
    "monthly_expenses_cents" INTEGER NOT NULL,
    "current_debt_payment_cents" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "guarantee" TEXT NOT NULL,
    "reference1_name" TEXT NOT NULL,
    "reference1_phone" TEXT NOT NULL,
    "reference2_name" TEXT NOT NULL,
    "reference2_phone" TEXT NOT NULL,
    "received_documents" "ClientDocument"[] DEFAULT ARRAY[]::"ClientDocument"[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_profiles_pkey" PRIMARY KEY ("request_id")
);

ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "credit_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Los importes no pueden ser negativos (pueden ser cero: sin otros ingresos, sin deudas).
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_money_non_negative"
    CHECK ("other_income_cents" >= 0 AND "monthly_expenses_cents" >= 0 AND "current_debt_payment_cents" >= 0);
