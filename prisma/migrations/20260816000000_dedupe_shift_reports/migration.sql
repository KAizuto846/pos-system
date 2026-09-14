-- Deduplicar reportes de turno: un reporte por usuario por dia (inicio de turno).
-- "Cerrar Turno" envia endDate = momento actual, por lo que dos cierres del mismo
-- dia creaban filas duplicadas. Se conserva el reporte mas reciente (id mayor).
DELETE FROM "shift_reports"
WHERE id NOT IN (
  SELECT MAX(id)
  FROM "shift_reports"
  GROUP BY "user_id", "start_date"
);

CREATE UNIQUE INDEX "shift_reports_user_id_start_date_key"
ON "shift_reports"("user_id", "start_date");