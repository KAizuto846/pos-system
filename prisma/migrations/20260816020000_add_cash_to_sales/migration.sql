-- Agrega el efectivo recibido y el cambio calculado al cobrar en efectivo.
-- El ticket de venta muestra "Recibido" y "Cambio" cuando estos campos existen.
ALTER TABLE "sales" ADD COLUMN "cash_received" REAL;
ALTER TABLE "sales" ADD COLUMN "change" REAL;