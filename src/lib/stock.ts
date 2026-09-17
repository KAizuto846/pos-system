import type { Prisma } from "@prisma/client";

// Convierte "MM/YYYY" o "MM-YYYY" al último día del mes (23:59:59). Null si inválido.
export function monthYearToEndOfMonth(monthYear: string): Date | null {
  const m = /^(\d{1,2})[/-](\d{4})$/.exec((monthYear || "").trim());
  if (!m) return null;
  const month = parseInt(m[1], 10);
  const year = parseInt(m[2], 10);
  if (month < 1 || month > 12 || year < 1900 || year > 2200) return null;
  return new Date(year, month, 0, 23, 59, 59, 999);
}

// Consume `qty` piezas de los lotes del producto: primero del lote que caduca
// antes, luego lotes sin caducidad; lo que exceda a los lotes queda como stock
// libre. No toca el stock total (el caller ya lo descuenta).
export async function consumeBatch(
  tx: Prisma.TransactionClient,
  productId: number,
  qty: number
) {
  if (qty <= 0) return;
  const batches = await tx.productBatch.findMany({
    where: { productId, quantity: { gt: 0 } },
  });
  const withDate = batches
    .filter((b) => b.expiresAt)
    .sort((a, b) => a.expiresAt!.getTime() - b.expiresAt!.getTime());
  const withoutDate = batches.filter((b) => !b.expiresAt);

  let remaining = qty;
  for (const b of [...withDate, ...withoutDate]) {
    if (remaining <= 0) break;
    const take = Math.min(b.quantity, remaining);
    if (take > 0) {
      await tx.productBatch.update({
        where: { id: b.id },
        data: { quantity: { decrement: take } },
      });
      remaining -= take;
    }
  }
}

// Agrega `qty` piezas al stock total y, si `batch` trae datos, las registra en
// un lote nuevo (caducidad y costo opcionales). Sin lote quedan como stock libre.
//
// Si se pasa `finalStock`, el stock total queda fijado a ese valor en lugar de
// incrementarse (permite corregir el conteo real al recibir: el cajero decide
// el total sin restricciones). El lote nuevo registra las piezas recibidas que
// quepan en el stock final; si el stock final es menor que las piezas ya
// asignadas a lotes (de recepciones anteriores), esas piezas excedentes se
// cancelan de los lotes previos (primero los que caducan antes).
export async function addStock(
  tx: Prisma.TransactionClient,
  productId: number,
  qty: number,
  batch?: { expiresAt?: Date | null; costPrice?: number },
  finalStock?: number
) {
  if (qty <= 0) return;

  let batchQty = qty;
  if (finalStock !== undefined) {
    if (!Number.isInteger(finalStock) || finalStock < 0) {
      throw new Error("Stock final inválido");
    }
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { stock: true, batches: { select: { quantity: true } } },
    });
    if (!product) throw new Error("Producto no encontrado");
    const existingBatchSum = product.batches.reduce((s, b) => s + b.quantity, 0);
    // El lote nuevo solo registra las piezas que quepan en el stock final.
    batchQty = Math.min(qty, finalStock);
    // Cancelar de los lotes previos las piezas que no caben junto al lote nuevo.
    const totalAfter = existingBatchSum + batchQty;
    if (totalAfter > finalStock) {
      await consumeBatch(tx, productId, totalAfter - finalStock);
    }
    await tx.product.update({
      where: { id: productId },
      data: { stock: finalStock },
    });
  } else {
    await tx.product.update({
      where: { id: productId },
      data: { stock: { increment: qty } },
    });
  }

  if (batch && batchQty > 0) {
    await tx.productBatch.create({
      data: {
        productId,
        quantity: batchQty,
        expiresAt: batch.expiresAt ?? null,
        costPrice: batch.costPrice ?? 0,
      },
    });
  }
}
