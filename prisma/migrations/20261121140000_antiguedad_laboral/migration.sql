-- Tiempo que el solicitante lleva en su trabajo actual. De este dato sale la prioridad de atención.
-- Es opcional en la base de datos porque las solicitudes anteriores no lo tienen; la API lo exige al crear.
CREATE TYPE "EmploymentTenure" AS ENUM ('MENOS_DE_1_ANIO', 'DE_1_A_3_ANIOS', 'TRES_ANIOS_O_MAS');

ALTER TABLE "credit_requests" ADD COLUMN "employment_tenure" "EmploymentTenure";
