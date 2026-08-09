import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { broadcast } from "@/lib/broadcast";
import { logChange } from "@/lib/sync-engine";
import { getDeviceId } from "@/lib/sync-utils";
import { initializePrisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const boxId = Number(body.productId);
    if (!Number.isInteger(boxId) || boxId <= 0) {
      return Response.json({ error: "ID de caja inválido" }, { status: 400 });
    }

    await initializePrisma();
    const logsToDelete = await prisma.piecesLog.findMany({
      where: { boxProductId: boxId },
      select: { id: true, createdAt: true },
    });

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const box = await tx.product.findUnique({
        where: { id: boxId },
        select: {
          id: true,
          name: true,
          barcode: true,
          stock: true,
          piecesPerUnit: true,
          piecesTracked: true,
        },
      });
      if (!box) throw new Error("Producto no encontrado");

      const piece = await tx.product.findFirst({
        where: { pieceOfProductId: boxId },
      });

      if (piece && piece.stock > 0) {
        const unit = box.piecesPerUnit ?? 1;
        const boxesToRestore = Math.ceil(piece.stock / unit);
        await tx.$executeRaw`
          UPDATE products SET stock = stock + ${boxesToRestore}
          WHERE id = ${boxId}
        `;
        await tx.$executeRaw`
          UPDATE products SET stock = 0, piece_of_product_id = NULL
          WHERE id = ${piece.id}
        `;
      } else if (piece) {
        await tx.$executeRaw`
          UPDATE products SET piece_of_product_id = NULL WHERE id = ${piece.id}
        `;
      }

      await tx.product.update({
        where: { id: boxId },
        data: { piecesTracked: false },
      });

      await tx.piecesLog.deleteMany({ where: { boxProductId: boxId } });
    });

    const freshBox = await prisma.product.findUnique({ where: { id: boxId } });
    const freshPiece = await prisma.product.findFirst({
      where: { pieceOfProductId: boxId },
    });

    broadcast("product:update", { id: boxId });

    if (freshBox) {
      const boxPatch = { ...freshBox } as Partial<typeof freshBox>;
      delete boxPatch.id;
      delete boxPatch.createdAt;
      delete boxPatch.updatedAt;
      void logChange(getDeviceId(), "UPDATE", "product", freshBox.id, boxPatch);
    }

    for (const log of logsToDelete) {
      void logChange(getDeviceId(), "DELETE", "pieceslog", log.id, { id: log.id });
    }

    return Response.json({ ok: true, box: freshBox, piece: freshPiece });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al revertir piezas";
    console.error("Error reverting pieces:", error);
    return Response.json({ error: message }, { status: 400 });
  }
}