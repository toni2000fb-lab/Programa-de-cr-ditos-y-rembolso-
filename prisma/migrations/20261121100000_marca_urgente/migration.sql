-- Marca interna de urgencia que pone un analista sobre solicitudes abiertas (CREADA o EN_REVISION).
ALTER TABLE "credit_requests" ADD COLUMN "urgent" BOOLEAN NOT NULL DEFAULT false;
