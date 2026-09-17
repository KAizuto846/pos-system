import { auth } from "@/lib/auth";
import { isHelperRole, helperForbidden } from "@/lib/roles";
import { initializePrisma, prisma } from "@/lib/db";
import { detectPiecesFromName, ensurePieceForBox } from "@/lib/pieces";
import { productSchema } from "@/lib/validations";
import { broadcast } from "@/lib/broadcast";
import { logChange } from "@/lib/sync-engine";
import { getDeviceId } from "@/lib/sync-utils";
import { logAudit, getClientIp, diffDetails } from "@/lib/audit";
import type { Prisma } from "@prisma/client";

// Convierte "MM/YYYY" o "MM-YYYY" al ultimo instante de ese mes (fin del dia).
function parseExpiry(value: string): Date {
  const [month, year] = value.split(/[/-]/);
  return new Date(
    parseInt(year, 10),
    parseInt(month, 10),
    0,
    23,
    59,
    59,
    999
  );
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }
    if (isHelperRole(session.user.role)) {
      return helperForbidden("inventario");
    }

    const { id } = await params;
    const productId = parseInt(id, 10);

    if (isNaN(productId)) {
      return Response.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = await request.json();
    const parsed = productSchema.partial().safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const updateData: Record<string, unknown> = {};

    // IMPORTANTE: solo se aplican los campos presentes en el body crudo. El
    // schema usa defaults (barcode="", cost=0, minStock=5...) que, si se
    // aplicaran a updates parciales, sobrescribirían datos existentes con
    // valores vacíos (por ejemplo, al guardar solo el precio de una pieza).
    const provided = (key: string) => key in (body as Record<string, unknown>) && data[key as keyof typeof data] !== undefined;

    if (data.name !== undefined) {
      updateData.name = data.name;
      const detected = detectPiecesFromName(data.name);
      if (detected) {
        const current = await prisma.product.findUnique({
          where: { id: productId },
          select: { piecesTracked: true, piecesPerUnit: true },
        });
        if (provided("piecesTracked")) {
          updateData.piecesTracked = data.piecesTracked;
        } else if (current) {
          if (current.piecesTracked) {
            updateData.piecesPerUnit = detected.pieces;
          } else if (current.piecesPerUnit === null) {
            updateData.piecesTracked = true;
            updateData.piecesPerUnit = detected.pieces;
          }
        }
      }
    }
    if (provided("barcode")) updateData.barcode = data.barcode;
    if (provided("price")) updateData.price = data.price;
    if (provided("cost")) updateData.cost = data.cost;
    if (provided("minStock")) updateData.minStock = data.minStock;
    if (provided("active")) updateData.active = data.active;
    if (provided("departmentId")) updateData.departmentId = data.departmentId;
    if (provided("supplierId")) updateData.supplierId = data.supplierId;
    if (provided("piecesPerUnit")) updateData.piecesPerUnit = data.piecesPerUnit;
    if (provided("piecesTracked")) updateData.piecesTracked = data.piecesTracked;
    if (provided("soldByBox")) {
      updateData.soldByBox = data.soldByBox;
      if (!data.soldByBox) {
        // Al quitar la gestión por cajas se limpian los datos asociados.
        updateData.unitsPerBox = null;
        updateData.boxRemainder = 0;
      }
    }
    if (provided("unitsPerBox")) updateData.unitsPerBox = data.unitsPerBox;

    const productLinesData = body.productLines;
    const batchOps = body.batchOps;

    // Estado previo para la auditoría (valores exactos antes del cambio).
    const beforeProduct = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        department: true,
        supplier: true,
        productLines: true,
        batches: true,
      },
    });
    if (!beforeProduct) {
      return Response.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    // Use a transaction: update product + replace productLines + batch ops
    await initializePrisma();
    const autoPieces: Array<{ id: number; name: string; barcode: string }> = [];

    const product = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Validate batch ops against current state before applying stock change
      if (batchOps && Array.isArray(batchOps) && batchOps.length > 0) {
        const current = await tx.product.findUnique({
          where: { id: productId },
          include: { batches: true },
        });
        if (!current) throw new Error("Producto no encontrado");

        const ops = batchOps as Array<{
          action: string;
          id?: number;
          quantity?: number;
          expiresAt?: string | null;
          costPrice?: number | null;
        }>;

        // Suma de piezas en lotes (excluyendo los que se van a eliminar o
        // reemplazar) para saber cuánto stock libre queda disponible.
        const excludedIds = new Set<number>();
        for (const op of ops) {
          if (op.action === "update" && typeof op.id === "number") {
            excludedIds.add(op.id);
          }
        }
        const keepTotal = current.batches
          .filter((b) => !excludedIds.has(b.id))
          .reduce((s, b) => s + b.quantity, 0);
        const newStock = typeof body.stock === "number" ? body.stock : current.stock;

        for (const op of ops) {
          if (op.action === "add") {
            const qty = op.quantity;
            if (!Number.isInteger(qty) || (qty ?? 0) <= 0) {
              throw new Error("Cantidad de lote inválida");
            }
            if (keepTotal + (qty ?? 0) > newStock) {
              throw new Error(
                `No hay suficiente stock libre para el lote. Disponible: ${Math.max(0, newStock - keepTotal)}`
              );
            }
          }
          if (op.action === "update" && typeof op.id === "number") {
            const batch = current.batches.find((b) => b.id === op.id);
            if (!batch) throw new Error(`Lote ${op.id} no encontrado`);
            const qty = op.quantity;
            if (!Number.isInteger(qty) || (qty ?? 0) < 0) {
              throw new Error("Cantidad de lote inválida");
            }
            if (keepTotal + (qty ?? 0) > newStock) {
              throw new Error(
                `No hay suficiente stock libre para el lote. Disponible: ${Math.max(0, newStock - keepTotal)}`
              );
            }
          }
          if (op.action === "delete" && typeof op.id === "number") {
            const batch = current.batches.find((b) => b.id === op.id);
            if (!batch) throw new Error(`Lote ${op.id} no encontrado`);
          }
        }
      }

      // Update product fields (including optional stock adjust)
      if (body.stock !== undefined) {
        if (typeof body.stock !== "number" || body.stock < 0 || !Number.isInteger(body.stock)) {
          throw new Error("Stock inválido");
        }
        updateData.stock = body.stock;
      }
      const updated = await tx.product.update({
        where: { id: productId },
        data: updateData,
      });

      // Apply batch ops after stock change
      if (batchOps && Array.isArray(batchOps) && batchOps.length > 0) {
        for (const op of batchOps as Array<{
          action: string;
          id?: number;
          quantity?: number;
          expiresAt?: string | null;
          costPrice?: number | null;
        }>) {
          if (op.action === "add") {
            const qty = op.quantity ?? 0;
            const expiresAt = op.expiresAt ? parseExpiry(op.expiresAt) : null;
            await tx.productBatch.create({
              data: {
                productId,
                quantity: qty,
                expiresAt,
                costPrice: op.costPrice ?? updated.cost ?? 0,
              },
            });
          }
          if (op.action === "update" && typeof op.id === "number") {
            const batch = await tx.productBatch.findUnique({
              where: { id: op.id },
            });
            if (!batch) throw new Error(`Lote ${op.id} no encontrado`);
            const expiresAt = op.expiresAt ? parseExpiry(op.expiresAt) : null;
            await tx.productBatch.update({
              where: { id: op.id },
              data: {
                quantity: op.quantity ?? batch.quantity,
                expiresAt,
                costPrice: op.costPrice ?? batch.costPrice,
              },
            });
          }
          if (op.action === "delete" && typeof op.id === "number") {
            await tx.productBatch.delete({ where: { id: op.id } });
          }
        }
      }

      // If productLines provided, replace all lines
      if (productLinesData && Array.isArray(productLinesData)) {
        // Delete existing lines
        await tx.productLine.deleteMany({ where: { productId } });

        // Create new lines if any
        if (productLinesData.length > 0) {
          await tx.productLine.createMany({
            data: productLinesData.map((pl: { supplierId: number; supplierPrice?: number | null; isPrimary?: boolean }) => ({
              productId,
              supplierId: pl.supplierId,
              supplierPrice: pl.supplierPrice ?? null,
              isPrimary: pl.isPrimary ?? false,
            })),
          });
        }

        // Update supplierId on product based on primary line
        const primary = productLinesData.find((pl: { isPrimary: boolean }) => pl.isPrimary) || productLinesData[0];
        if (primary) {
          await tx.product.update({
            where: { id: productId },
            data: { supplierId: primary.supplierId },
          });
        } else {
          await tx.product.update({
            where: { id: productId },
            data: { supplierId: null },
          });
        }
      }

      // Si el nombre ahora termina en CT/(N) y no existe aún su producto
      // pieza, se crea automáticamente una sola vez. La pieza nace con
      // piecesPerUnit = N y es independiente: editar la caja NO vuelve a
      // tocarla nunca.
      const finalProduct = await tx.product.findUnique({ where: { id: productId } });
      if (finalProduct?.piecesTracked && (finalProduct.piecesPerUnit ?? detectPiecesFromName(finalProduct.name)?.pieces)) {
        const pieces = finalProduct.piecesPerUnit ?? detectPiecesFromName(finalProduct.name)?.pieces ?? 0;
        if (pieces > 0) {
          const createdPiece = await ensurePieceForBox(tx, {
            id: finalProduct.id,
            name: finalProduct.name,
            barcode: finalProduct.barcode,
            price: finalProduct.price,
            cost: finalProduct.cost,
            departmentId: finalProduct.departmentId,
            supplierId: finalProduct.supplierId,
          }, pieces);
          if (createdPiece) {
            autoPieces.push({
              id: createdPiece.id,
              name: createdPiece.name,
              barcode: createdPiece.barcode,
            });
          }
        }
      }

      // Return the final product with includes
      return tx.product.findUnique({
        where: { id: productId },
        include: {
          department: true,
          supplier: true,
          productLines: { include: { supplier: true } },
          batches: true,
        },
      });
    });

    broadcast("product:update", { id: productId });
    void logChange(getDeviceId(), "UPDATE", "product", productId, updateData);
    void logAudit({
      userId: parseInt(session.user.id, 10),
      userName: session.user.name,
      userRole: session.user.role,
      action: "update",
      entity: "product",
      entityId: productId,
      description: `Producto editado: ${product?.name || '#' + productId}`,
      details: {
        cambios: diffDetails(
          {
            name: beforeProduct.name,
            barcode: beforeProduct.barcode,
            price: beforeProduct.price,
            cost: beforeProduct.cost,
            stock: beforeProduct.stock,
            minStock: beforeProduct.minStock,
            active: beforeProduct.active,
            departmentId: beforeProduct.departmentId,
            supplierId: beforeProduct.supplierId,
            soldByBox: beforeProduct.soldByBox,
            unitsPerBox: beforeProduct.unitsPerBox,
            piecesPerUnit: beforeProduct.piecesPerUnit,
            piecesTracked: beforeProduct.piecesTracked,
          },
          {
            name: product?.name,
            barcode: product?.barcode,
            price: product?.price,
            cost: product?.cost,
            stock: product?.stock,
            minStock: product?.minStock,
            active: product?.active,
            departmentId: product?.departmentId,
            supplierId: product?.supplierId,
            soldByBox: product?.soldByBox,
            unitsPerBox: product?.unitsPerBox,
            piecesPerUnit: product?.piecesPerUnit,
            piecesTracked: product?.piecesTracked,
          }
        ),
        ...(Array.isArray(batchOps) && batchOps.length > 0 ? { lotes: batchOps } : {}),
        ...(productLinesData && Array.isArray(productLinesData)
          ? {
              proveedores: {
                antes: beforeProduct.productLines.map((pl) => ({
                  supplierId: pl.supplierId,
                  supplierPrice: pl.supplierPrice,
                  isPrimary: pl.isPrimary,
                })),
                despues: productLinesData,
              },
            }
          : {}),
      },
      before: {
        name: beforeProduct.name,
        barcode: beforeProduct.barcode,
        price: beforeProduct.price,
        cost: beforeProduct.cost,
        stock: beforeProduct.stock,
        minStock: beforeProduct.minStock,
        active: beforeProduct.active,
        departmentId: beforeProduct.departmentId,
        supplierId: beforeProduct.supplierId,
        soldByBox: beforeProduct.soldByBox,
        unitsPerBox: beforeProduct.unitsPerBox,
      },
      after: {
        name: product?.name,
        barcode: product?.barcode,
        price: product?.price,
        cost: product?.cost,
        stock: product?.stock,
        minStock: product?.minStock,
        active: product?.active,
        departmentId: product?.departmentId,
        supplierId: product?.supplierId,
        soldByBox: product?.soldByBox,
        unitsPerBox: product?.unitsPerBox,
      },
      ip: getClientIp(request),
    });

    for (const autoPiece of autoPieces) {
      broadcast("product:create", { id: autoPiece.id });
      void logChange(getDeviceId(), "CREATE", "product", autoPiece.id, {
        id: autoPiece.id,
        name: autoPiece.name,
        barcode: autoPiece.barcode,
        pieceOfProductId: productId,
      });
      void logAudit({
        userId: parseInt(session.user.id, 10),
        userName: session.user.name,
        userRole: session.user.role,
        action: "create",
        entity: "product",
        entityId: autoPiece.id,
        description: `Producto pieza creado automáticamente para la caja: ${product?.name || '#' + productId}`,
        after: { name: autoPiece.name, barcode: autoPiece.barcode, pieceOfProductId: productId },
        ip: getClientIp(request),
      });
    }

    return Response.json(product);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al actualizar producto";
    console.error("Error updating product:", error);
    if (
      message.includes("suficiente") ||
      message.includes("Lote") ||
      message.includes("inválido") ||
      message.includes("no encontrado")
    ) {
      return Response.json({ error: message }, { status: 400 });
    }
    return Response.json({ error: "Error al actualizar producto" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }
    if (isHelperRole(session.user.role)) {
      return helperForbidden("inventario");
    }

    const { id } = await params;
    const productId = parseInt(id, 10);

    if (isNaN(productId)) {
      return Response.json({ error: "ID inválido" }, { status: 400 });
    }

    const existing = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        pieceChildren: { select: { id: true, name: true } },
      },
    });

    // Un producto con historial (ventas, pedidos, reembolsos o avisos de stock)
    // no puede eliminarse físicamente por las restricciones de llave foránea.
    // En ese caso se desactiva (soft-delete) para preservar el historial.
    const [hasSales, hasOrders, hasRefunds, hasStockAlerts] = await Promise.all([
      prisma.saleItem.count({ where: { productId } }),
      prisma.supplierOrderItem.count({ where: { productId } }),
      prisma.refund.count({ where: { productId } }),
      prisma.stockAlert.count({ where: { productId } }),
    ]);

    const hasHistory = hasSales > 0 || hasOrders > 0 || hasRefunds > 0 || hasStockAlerts > 0;
    // Una caja con producto(s) pieza no se elimina físicamente: la pieza debe
    // recordar a su caja para siempre (pieceOfProductId). Se desactiva.
    const hasPieces = (existing?.pieceChildren.length ?? 0) > 0;

    if (hasHistory || hasPieces) {
      await prisma.product.update({
        where: { id: productId },
        data: { active: false },
      });
      broadcast("product:update", { id: productId });
      void logChange(getDeviceId(), "UPDATE", "product", productId, { active: false });
      void logAudit({
        userId: parseInt(session.user.id, 10),
        userName: session.user.name,
        userRole: session.user.role,
        action: "update",
        entity: "product",
        entityId: productId,
        description: hasPieces
          ? `Producto caja desactivado (tiene producto pieza que lo referencia): ${existing?.name || '#' + productId}`
          : `Producto desactivado (tiene historial): ${existing?.name || '#' + productId}`,
        details: {
          name: existing?.name,
          barcode: existing?.barcode,
          precio: existing?.price,
          costo: existing?.cost,
          stock: existing?.stock,
          ventas: hasSales,
          pedidos: hasOrders,
          reembolsos: hasRefunds,
          ...(hasPieces ? { piezasQueLoReferencian: existing?.pieceChildren.map((p) => p.name) } : {}),
          softDelete: true,
        },
        before: { active: existing?.active ?? true },
        after: { active: false },
        ip: getClientIp(request),
      });
      return Response.json({ success: true, softDelete: true });
    }

    await prisma.product.delete({
      where: { id: productId },
    });

    broadcast("product:delete", { id: productId });
    void logChange(getDeviceId(), "DELETE", "product", productId, {});
    void logAudit({
      userId: parseInt(session.user.id, 10),
      userName: session.user.name,
      userRole: session.user.role,
      action: "delete",
      entity: "product",
      entityId: productId,
      description: `Producto eliminado: ${existing?.name || '#' + productId}`,
      before: {
        name: existing?.name,
        barcode: existing?.barcode,
        price: existing?.price,
        cost: existing?.cost,
        stock: existing?.stock,
        minStock: existing?.minStock,
        active: existing?.active,
        piezas: existing?.pieceChildren.map((p) => p.name) ?? [],
      },
      after: null,
      ip: getClientIp(request),
    });
    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting product:", error);
    return Response.json({ error: "Error al eliminar producto" }, { status: 500 });
  }
}
