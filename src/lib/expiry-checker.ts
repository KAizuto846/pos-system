import { prisma } from "@/lib/db";

/**
 * Calcula cuántos días faltan para una fecha de vencimiento.
 * Valores negativos = ya vencido.
 */
export function getDaysUntilExpiry(expiryDate: Date): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const expiry = new Date(expiryDate.getFullYear(), expiryDate.getMonth(), expiryDate.getDate());
  const diffTime = expiry.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Revisa todos los lotes con fecha de vencimiento y crea notificaciones
 * para productos próximos a vencer o ya vencidos.
 * Llámalo después de crear lotes o vender.
 */
export async function checkAndNotifyExpiry(): Promise<{
  created: number;
  warnings: { productName: string; daysLeft: number; severity: string }[];
}> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const in7Days = new Date(todayStart);
  in7Days.setDate(in7Days.getDate() + 7);

  const batches = await prisma.stockBatch.findMany({
    where: {
      expiryDate: { not: null },
      quantity: { gt: 0 },
    },
    include: { product: { select: { id: true, name: true } } },
    orderBy: { expiryDate: "asc" },
  });

  // Agrupar por producto, tomar la fecha más próxima
  const productMap = new Map<number, { product: { id: number; name: string }; nearestExpiry: Date; totalQty: number }>();
  for (const batch of batches) {
    if (!batch.expiryDate) continue;
    const existing = productMap.get(batch.productId);
    if (!existing || batch.expiryDate < existing.nearestExpiry) {
      productMap.set(batch.productId, {
        product: batch.product,
        nearestExpiry: batch.expiryDate,
        totalQty: (existing?.totalQty || 0) + batch.quantity,
      });
    } else {
      existing.totalQty += batch.quantity;
    }
  }

  const warnings: { productName: string; daysLeft: number; severity: string }[] = [];
  let created = 0;

  for (const [, entry] of productMap) {
    const daysLeft = getDaysUntilExpiry(entry.nearestExpiry);

    if (daysLeft < 0) {
      // Ya vencido
      const title = "Producto vencido";
      const message = `${entry.product.name} venció hace ${Math.abs(daysLeft)} día(s). Quedan ${entry.totalQty} unidad(es) en inventario.`;

      // Evitar duplicados (no crear otra notificacion igual en las últimas 24h)
      const recent = await prisma.notification.findFirst({
        where: {
          productId: entry.product.id,
          type: "EXPIRED",
          createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
      });

      if (!recent) {
        await prisma.notification.create({
          data: {
            type: "EXPIRED",
            title,
            message,
            productId: entry.product.id,
            severity: "danger",
          },
        });
        created++;
        warnings.push({ productName: entry.product.name, daysLeft, severity: "danger" });
      }
    } else if (daysLeft === 0) {
      // Vence hoy
      const title = "Vence hoy";
      const message = `${entry.product.name} vence HOY. Quedan ${entry.totalQty} unidad(es).`;

      const recent = await prisma.notification.findFirst({
        where: {
          productId: entry.product.id,
          type: "EXPIRY_TODAY",
          createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
      });

      if (!recent) {
        await prisma.notification.create({
          data: {
            type: "EXPIRY_TODAY",
            title,
            message,
            productId: entry.product.id,
            severity: "danger",
          },
        });
        created++;
        warnings.push({ productName: entry.product.name, daysLeft, severity: "danger" });
      }
    } else if (daysLeft <= 7) {
      // Próximo a vencer
      const title = "Próximo a vencer";
      const message = `${entry.product.name} vence en ${daysLeft} día(s). Quedan ${entry.totalQty} unidad(es).`;

      const recent = await prisma.notification.findFirst({
        where: {
          productId: entry.product.id,
          type: "EXPIRY_WARNING",
          createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
      });

      if (!recent) {
        await prisma.notification.create({
          data: {
            type: "EXPIRY_WARNING",
            title,
            message,
            productId: entry.product.id,
            severity: daysLeft <= 3 ? "warning" : "info",
          },
        });
        created++;
        warnings.push({ productName: entry.product.name, daysLeft, severity: daysLeft <= 3 ? "warning" : "info" });
      }
    }
  }

  return { created, warnings };
}
