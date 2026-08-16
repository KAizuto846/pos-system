import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  detectPiecesFromName,
  nextAvailablePieceBarcode,
  pieceBarcode,
  pieceDisplayName,
} from "@/lib/pieces";
import { broadcast } from "@/lib/broadcast";
import { logChange } from "@/lib/sync-engine";
import { getDeviceId } from "@/lib/sync-utils";
import { logAudit, getClientIp } from "@/lib/audit";
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

    const box = await prisma.product.findUnique({
      where: { id: boxId },
      include: { productLines: true },
    });
    if (!box) {
      return Response.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    const detected = detectPiecesFromName(box.name);
    let pieces = Number(body.pieces);
    if (!Number.isInteger(pieces) || pieces <= 0) {
      pieces = box.piecesPerUnit ?? detected?.pieces ?? 0;
    }
    if (pieces <= 0 || pieces > 9999) {
      return Response.json(
        {
          error:
            "No se pudo determinar la cantidad de piezas por caja. Termina el nombre con CT/(N) (ej. 'Paracetamol CT/10') o especifica la cantidad.",
        },
        { status: 400 }
      );
    }

    if (box.stock < 1) {
      return Response.json(
        { error: "No hay stock de cajas de este producto para generar piezas." },
        { status: 400 }
      );
    }

    const dt = new Date();
    const pieceName = pieceDisplayName(box.name);

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const consumed = await tx.$executeRaw`
        UPDATE products SET stock = stock - 1, pieces_per_unit = ${pieces}, pieces_tracked = 1
        WHERE id = ${box.id} AND stock >= 1
      `;
      if (consumed === 0) {
        throw new Error("Sin stock de caja disponible para generar piezas.");
      }

      let piece = await tx.product.findFirst({
        where: { pieceOfProductId: box.id },
        include: { productLines: true },
      });

      if (!piece) {
        const barcode = await nextAvailablePieceBarcode(tx, pieceBarcode(box.barcode));
        const lines =
          box.productLines?.map((line) => ({
            supplierId: line.supplierId,
            supplierPrice: line.supplierPrice,
            isPrimary: line.isPrimary,
          })) ?? [];
        piece = await tx.product.create({
          data: {
            name: pieceName,
            barcode,
            price: box.price,
            cost: box.cost,
            stock: 0,
            minStock: 1,
            active: true,
            departmentId: box.departmentId,
            supplierId: box.supplierId,
            pieceOfProductId: box.id,
            productLines: { create: lines },
          },
          include: { productLines: true },
        });
      }

      await tx.product.update({
        where: { id: piece.id },
        data: { stock: { increment: pieces }, active: true },
      });

      await tx.piecesLog.create({
        data: {
          boxProductId: box.id,
          pieces,
          source: "generated",
          createdAt: dt,
        },
      });
    });

    const freshBox = await prisma.product.findUnique({ where: { id: box.id } });
    const freshPiece = await prisma.product.findFirst({
      where: { pieceOfProductId: box.id },
    });

    const boxData = freshBox
      ? {
          name: freshBox.name,
          barcode: freshBox.barcode,
          price: freshBox.price,
          cost: freshBox.cost,
          stock: freshBox.stock,
          minStock: freshBox.minStock,
          active: freshBox.active,
          departmentId: freshBox.departmentId,
          supplierId: freshBox.supplierId,
          piecesPerUnit: freshBox.piecesPerUnit,
          piecesTracked: freshBox.piecesTracked,
        }
      : null;

    broadcast("product:update", { id: box.id });
    void logChange(getDeviceId(), "UPDATE", "product", box.id, boxData);

    if (freshPiece) {
      const pieceData = {
        name: freshPiece.name,
        barcode: freshPiece.barcode,
        price: freshPiece.price,
        cost: freshPiece.cost,
        stock: freshPiece.stock,
        minStock: freshPiece.minStock,
        active: freshPiece.active,
        departmentId: freshPiece.departmentId,
        supplierId: freshPiece.supplierId,
        pieceOfProductId: freshPiece.pieceOfProductId,
      };
      broadcast("product:create", { id: freshPiece.id });
      void logChange(getDeviceId(), "CREATE", "product", freshPiece.id, pieceData);
      void logChange(getDeviceId(), "CREATE", "pieceslog", dt.getTime(), {
        boxProductId: box.id,
        pieces,
        source: "generated",
        createdAt: dt.toISOString(),
      });
    }

    void logAudit({
      userId: parseInt(session.user.id, 10),
      userName: session.user.name,
      userRole: session.user.role,
      action: "create",
      entity: "pieces",
      entityId: box.id,
      description: `Piezas generadas: ${pieces} de ${freshBox?.name || 'caja #' + box.id}`,
      details: { boxId: box.id, pieces, pieceId: freshPiece?.id },
      ip: getClientIp(request),
    });

    return Response.json({
      box: freshBox,
      piece: freshPiece,
      pieces,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al generar piezas";
    console.error("Error generating pieces:", error);
    return Response.json({ error: message }, { status: 400 });
  }
}