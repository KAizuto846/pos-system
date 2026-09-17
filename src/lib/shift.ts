import { prisma } from "@/lib/db";

// Devuelve el rango de fechas del turno actual de un usuario.
// El turno empieza cuando termino el ultimo corte (asi las ventas NO se
// reinician a las 00:00: solo se reinician al cerrar turno, lo que importa
// para cajeros de turno nocturno que cruzan la medianoche).
// Si el usuario nunca ha cerrado un turno, se usa la primera venta de hoy
// (o las 00:00 de hoy si aun no vende nada).
export async function getCurrentShiftRange(userId: number, now = new Date()) {
  const lastReport = await prisma.shiftReport.findFirst({
    where: { userId },
    orderBy: { endDate: "desc" },
    select: { endDate: true },
  });

  let start: Date;
  if (lastReport) {
    start = lastReport.endDate;
  } else {
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const firstSale = await prisma.sale.findFirst({
      where: { userId, createdAt: { gte: startOfDay } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    start = firstSale?.createdAt ?? startOfDay;
  }

  if (start.getTime() > now.getTime()) start = now;

  return { start, end: now };
}
