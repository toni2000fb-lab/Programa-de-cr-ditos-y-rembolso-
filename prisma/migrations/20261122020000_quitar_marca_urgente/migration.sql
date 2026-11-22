-- La marca de urgente ya no se usa: la prioridad sale de la antigüedad laboral.
-- Los movimientos que dejó en la auditoría se conservan, porque ese registro es inmutable.
ALTER TABLE "credit_requests" DROP COLUMN "urgent";
