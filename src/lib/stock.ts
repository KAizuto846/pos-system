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
// incrementarse (permite corregir el conteo real al recibir: las piezas que
// llegan siempre cuentan, pero el cajero puede ajustar el total hacia arriba o
// hacia abajo). El lote siempre registra las `qty` piezas recibidas.
export async function addStock(
  tx: Prisma.TransactionClient,
  productId: number,
  qty: number,
  batch?: { expiresAt?: Date | null; costPrice?: number },
  finalStock?: number
) {
  if (qty <= 0) return;

  if (finalStock !== undefined) {
    if (!Number.isInteger(finalStock) || finalStock < 0) {
      throw new Error("Stock final inválido");
    }
    if (finalStock < qty) {
      throw new Error("Stock final inválido: no puede ser menor a las piezas recibidas");
    }
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { stock: true, batches: { select: { quantity: true } } },
    });
    if (!product) throw new Error("Producto no encontrado");
    const batchTotal = product.batches.reduce((s, b) => s + b.quantity, 0) + qty;
    if (finalStock < batchTotal) {
      throw new Error(
        `Stock final inválido: no puede quedar por debajo de las ${batchTotal} piezas asignadas a lotes`
      );
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

  if (batch && qty > 0) {
    await tx.productBatch.create({
      data: {
        productId,
        quantity: qty,
        expiresAt: batch.expiresAt ?? null,
        costPrice: batch.costPrice ?? 0,
      },
    });
  }
}
