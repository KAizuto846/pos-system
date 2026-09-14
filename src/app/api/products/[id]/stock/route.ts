import { auth } from "@/lib/auth";
<<<<<<< HEAD
import { prisma } from "@/lib/db";
import { broadcast } from "@/lib/broadcast";
=======
import { initializePrisma, prisma } from "@/lib/db";
import { broadcast } from "@/lib/broadcast";
import { logChange } from "@/lib/sync-engine";
import { getDeviceId } from "@/lib/sync-utils";
import { logAudit, getClientIp } from "@/lib/audit";
>>>>>>> origin/master

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const productId = parseInt(id, 10);

    if (isNaN(productId)) {
      return Response.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = await request.json();
    const { quantity } = body;

    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity === 0) {
      return Response.json(
        { error: "Cantidad inválida. Debe ser un número entero distinto de cero." },
        { status: 400 }
      );
    }

<<<<<<< HEAD
    // Atomic stock update using raw SQL
    // This prevents race conditions between concurrent adjustments
    let result: number;
    if (quantity < 0) {
      // Decreasing stock: only succeed if there's enough
      result = await prisma.$executeRaw`
        UPDATE products SET stock = stock + ${quantity}
        WHERE id = ${productId} AND stock >= ${-quantity}
      `;
    } else {
      // Increasing stock: always succeeds
      result = await prisma.$executeRaw`
        UPDATE products SET stock = stock + ${quantity}
        WHERE id = ${productId}
      `;
    }

    if (result === 0) {
      // Check if product exists
      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { name: true, stock: true },
      });

      if (!product) {
        return Response.json({ error: "Producto no encontrado" }, { status: 404 });
      }
=======
    await initializePrisma();
    const result = await prisma.$transaction(async (tx) => {
      // El stock no puede quedar por debajo de la suma de piezas en lotes
      if (quantity < 0) {
        const product = await tx.product.findUnique({
          where: { id: productId },
          include: { batches: true },
        });
        if (!product) return { error: "not_found" as const };
        const batchTotal = product.batches.reduce((s, b) => s + b.quantity, 0);
        if (product.stock + quantity < batchTotal) {
          return { error: "batch_limit" as const, batchTotal };
        }
      }

      const changed = quantity < 0
        ? await tx.$executeRaw`
            UPDATE products SET stock = stock + ${quantity}
            WHERE id = ${productId} AND stock >= ${-quantity}
          `
        : await tx.$executeRaw`
            UPDATE products SET stock = stock + ${quantity}
            WHERE id = ${productId}
          `;

      if (changed === 0) {
        const exists = await tx.product.count({ where: { id: productId } });
        return { error: exists === 0 ? "not_found" as const : "insufficient" as const };
      }

      const updated = await tx.product.findUnique({
        where: { id: productId },
        include: { department: true, supplier: true },
      });
      return { updated };
    });

    if ("error" in result) {
      if (result.error === "not_found") {
        return Response.json({ error: "Producto no encontrado" }, { status: 404 });
      }
      if (result.error === "batch_limit") {
        return Response.json(
          { error: `Stock insuficiente: no puede quedar por debajo de las ${result.batchTotal} piezas asignadas a lotes.` },
          { status: 400 }
        );
      }
>>>>>>> origin/master

      return Response.json(
        { error: "Stock insuficiente. El stock no puede ser negativo." },
        { status: 400 }
      );
    }

<<<<<<< HEAD
    const updated = await prisma.product.findUnique({
      where: { id: productId },
      include: { department: true, supplier: true },
    });

    broadcast("product:stock", { id: productId, stock: updated!.stock });
    return Response.json(updated);
=======
    if (!result.updated) {
      return Response.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    broadcast("product:stock", { id: productId, stock: result.updated.stock });
    void logChange(getDeviceId(), "UPDATE", "product", productId, { stock: result.updated.stock });
    void logAudit({
      userId: parseInt(session.user.id, 10),
      userName: session.user.name,
      userRole: session.user.role,
      action: "stock",
      entity: "product",
      entityId: productId,
      description: `Ajuste de stock: ${quantity >= 0 ? '+' : ''}${quantity} (${result.updated.name || '#' + productId})`,
      details: { quantity, stock: result.updated.stock },
      ip: getClientIp(request),
    });
    return Response.json(result.updated);
>>>>>>> origin/master
  } catch (error) {
    console.error("Error adjusting stock:", error);
    return Response.json({ error: "Error al ajustar stock" }, { status: 500 });
  }
}
