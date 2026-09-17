import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const in7Days = new Date(now);
    in7Days.setDate(in7Days.getDate() + 7);

    // Products expiring today
    const expiringToday = await prisma.productBatch.findMany({
      where: {
        expiresAt: {
          not: null,
          gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          lte: todayEnd,
        },
        quantity: { gt: 0 },
      },
      include: { product: { select: { id: true, name: true, barcode: true, stock: true } } },
      orderBy: { expiresAt: "asc" },
    });

    // Products expired
    const expiredBatches = await prisma.productBatch.findMany({
      where: {
        expiresAt: { not: null, lt: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
        quantity: { gt: 0 },
      },
      include: { product: { select: { id: true, name: true, barcode: true, stock: true } } },
      orderBy: { expiresAt: "asc" },
    });

    // Products expiring within 7 days (excluding today)
    const nearExpiryBatches = await prisma.productBatch.findMany({
      where: {
        expiresAt: {
          not: null,
          gt: todayEnd,
          lte: in7Days,
        },
        quantity: { gt: 0 },
      },
      include: { product: { select: { id: true, name: true, barcode: true, stock: true } } },
      orderBy: { expiresAt: "asc" },
    });

    // Group by product
    function groupByProduct(batches: typeof nearExpiryBatches) {
      const map = new Map<number, { product: typeof batches[0]["product"]; batches: typeof batches; totalQty: number; nearestExpiry: Date | null }>();
      for (const b of batches) {
        if (!b.expiresAt) continue;
        if (!map.has(b.productId)) {
          map.set(b.productId, { product: b.product, batches: [], totalQty: 0, nearestExpiry: null });
        }
        const entry = map.get(b.productId)!;
        entry.batches.push(b);
        entry.totalQty += b.quantity;
        if (!entry.nearestExpiry || b.expiresAt < entry.nearestExpiry) {
          entry.nearestExpiry = b.expiresAt;
        }
      }
      return Array.from(map.values()).map(({ product, totalQty, nearestExpiry, batches }) => ({
        product, totalQty, nearestExpiry: nearestExpiry?.toISOString() ?? null, batchCount: batches.length,
      }));
    }

    return Response.json({
      expiringToday: groupByProduct(expiringToday),
      nearExpiry: groupByProduct(nearExpiryBatches),
      expired: groupByProduct(expiredBatches),
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    console.error("Error getting expiry summary:", error);
    return Response.json({ error: "Error al obtener resumen" }, { status: 500 });
  }
}
