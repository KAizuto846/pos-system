import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const supplierId = searchParams.get("supplierId");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const timeFrom = searchParams.get("timeFrom") || "00:00";
    const timeTo = searchParams.get("timeTo") || "23:59";

    if (!supplierId || !dateFrom || !dateTo) {
      return Response.json(
        { error: "Se requieren supplierId, dateFrom y dateTo" },
        { status: 400 }
      );
    }

    const sid = parseInt(supplierId);
    if (isNaN(sid)) {
      return Response.json({ error: "supplierId inválido" }, { status: 400 });
    }

    // Construir fechas con horas
    const fromDate = new Date(`${dateFrom}T${timeFrom}:00`);
    const toDate = new Date(`${dateTo}T${timeTo}:59`);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return Response.json({ error: "Fechas inválidas" }, { status: 400 });
    }

    // Obtener ventas en el rango, agrupadas por producto del proveedor (solo si el proveedor es el PRINCIPAL via ProductLine)
    const saleItems = await prisma.saleItem.findMany({
      where: {
        sale: {
          createdAt: {
            gte: fromDate,
            lte: toDate,
          },
        },
        product: {
          active: true,
          productLines: {
            some: { supplierId: sid, isPrimary: true },
          },
        },
      },
      include: {
        product: {
          include: {
            department: true,
            productLines: {
              select: { supplierId: true, supplierPrice: true, isPrimary: true },
            },
          },
        },
      },
    });

    // Agrupar por producto y sumar cantidades
    const grouped = new Map<
      number,
      {
        productId: number;
        name: string;
        barcode: string;
        price: number;
        cost: number;
        stock: number;
        minStock: number;
        department: { id: number; name: string } | null;
        supplierPrice: number | null;
        totalSold: number;
        // Gestión de cajas: totalSold queda en número de cajas cuando el
        // producto se pide por cajas; estos campos guardan el detalle.
        soldByBox?: boolean;
        unitsPerBox?: number | null;
        boxRemainder?: number;
        totalSoldUnits?: number;
      }
    >();

    // Ventas de piezas ("Pieza de...") agrupadas por caja (pieceOfProductId)
    const pieceSalesByBox = new Map<number, number>();

    for (const item of saleItems) {
      const pid = item.productId;
      const pieceBoxId = item.product.pieceOfProductId;

      if (pieceBoxId) {
        pieceSalesByBox.set(
          pieceBoxId,
          (pieceSalesByBox.get(pieceBoxId) ?? 0) + item.quantity
        );
        continue;
      }

      const existing = grouped.get(pid);
      if (existing) {
        existing.totalSold += item.quantity;
      } else {
        const lines = item.product.productLines || [];
        const line = lines.find(l => l.supplierId === sid && l.isPrimary)
          ?? lines.find(l => l.supplierId === sid);
        grouped.set(pid, {
          productId: pid,
          name: item.product.name,
          barcode: item.product.barcode,
          price: item.product.price,
          cost: item.product.cost,
          stock: item.product.stock,
          minStock: item.product.minStock,
          department: item.product.department,
          supplierPrice: line?.supplierPrice ?? null,
          totalSold: item.quantity,
        });
      }
    }

    // Reembolsos en el rango: lo devuelto regreso al inventario y no debe
    // volver a pedirse como si se hubiera vendido.
    const refunds = await prisma.refund.findMany({
      where: {
        createdAt: { gte: fromDate, lte: toDate },
        product: {
          active: true,
          productLines: {
            some: { supplierId: sid, isPrimary: true },
          },
        },
      },
      select: { productId: true, quantity: true, product: { select: { pieceOfProductId: true } } },
    });

    const refundedBox = new Map<number, number>();
    const refundedPieces = new Map<number, number>();
    for (const r of refunds) {
      if (r.product.pieceOfProductId) {
        refundedPieces.set(r.product.pieceOfProductId, (refundedPieces.get(r.product.pieceOfProductId) ?? 0) + r.quantity);
      } else {
        refundedBox.set(r.productId, (refundedBox.get(r.productId) ?? 0) + r.quantity);
      }
    }

    // Cajas abiertas en el rango (cada entrada = 1 caja consumida, con o sin venta)
    const logs = await prisma.piecesLog.findMany({
      where: {
        createdAt: { gte: fromDate, lte: toDate },
        boxProduct: {
          active: true,
          productLines: {
            some: { supplierId: sid, isPrimary: true },
          },
        },
      },
      select: { boxProductId: true, pieces: true },
    });

    const openedByBox = new Map<number, number>();
    for (const log of logs) {
      openedByBox.set(log.boxProductId, (openedByBox.get(log.boxProductId) ?? 0) + 1);
    }

    // Piezas reembolsadas se restan de las piezas vendidas de su caja
    for (const [boxId, qty] of refundedPieces) {
      pieceSalesByBox.set(boxId, Math.max(0, (pieceSalesByBox.get(boxId) ?? 0) - qty));
    }

    // Datos de las cajas involucradas (vendidas, abiertas o con piezas vendidas)
    const boxIds = new Set([
      ...grouped.keys(),
      ...openedByBox.keys(),
      ...pieceSalesByBox.keys(),
    ]);

    // Datos de gestión por cajas por producto (para convertir unidades a cajas)
    const boxInfo = new Map<
      number,
      { soldByBox: boolean; unitsPerBox: number | null; boxRemainder: number }
    >();

    if (boxIds.size > 0) {
      const boxes = await prisma.product.findMany({
        where: { id: { in: [...boxIds] } },
        select: {
          id: true,
          name: true,
          barcode: true,
          price: true,
          cost: true,
          stock: true,
          minStock: true,
          active: true,
          piecesPerUnit: true,
          soldByBox: true,
          unitsPerBox: true,
          boxRemainder: true,
          department: true,
          productLines: {
            select: { supplierId: true, supplierPrice: true, isPrimary: true },
          },
        },
      });

      for (const box of boxes) {
        boxInfo.set(box.id, {
          soldByBox: box.soldByBox,
          unitsPerBox: box.unitsPerBox,
          boxRemainder: box.boxRemainder,
        });
        if (!box.active) continue;
        const own = grouped.get(box.id)?.totalSold ?? 0;
        const opened = openedByBox.get(box.id) ?? 0;
        const pieceQty = pieceSalesByBox.get(box.id) ?? 0;
        const unit = box.piecesPerUnit;
        let extra = 0;
        if (unit && unit > 0) {
          const uncovered = pieceQty - opened * unit;
          if (uncovered > 0) extra = Math.ceil(uncovered / unit);
        }
        const totalSold = own + opened + extra;
        if (totalSold === 0) continue;

        const lines = box.productLines || [];
        const line = lines.find(l => l.supplierId === sid && l.isPrimary)
          ?? lines.find(l => l.supplierId === sid);

        grouped.set(box.id, {
          productId: box.id,
          name: box.name,
          barcode: box.barcode,
          price: box.price,
          cost: box.cost,
          stock: box.stock,
          minStock: box.minStock,
          department: box.department,
          supplierPrice: line?.supplierPrice ?? null,
          totalSold,
          soldByBox: box.soldByBox,
          unitsPerBox: box.unitsPerBox,
          boxRemainder: box.boxRemainder,
          totalSoldUnits: totalSold,
        });
      }
    }

    // Reembolsos de cajas: se restan de las ventas del producto (si queda 0,
    // no se sugiere reponerlo)
    for (const [pid, qty] of refundedBox) {
      const existing = grouped.get(pid);
      if (existing) {
        existing.totalSold = Math.max(0, existing.totalSold - qty);
        if (existing.totalSold === 0) {
          grouped.delete(pid);
        }
      }
    }

    // Ordenar por más vendidos primero
    const result = Array.from(grouped.values()).sort(
      (a, b) => b.totalSold - a.totalSold
    );

    // Gestión de cajas: si el producto se pide por cajas, las unidades vendidas
    // se convierten a cajas completas. Las que no completan una caja quedan
    // acumuladas en boxRemainder del producto y se toman en el siguiente pedido.
    for (const p of result) {
      const info = boxInfo.get(p.productId);
      if (info && info.soldByBox && info.unitsPerBox && info.unitsPerBox > 0) {
        const totalSoldUnits = p.totalSold;
        const availableUnits = totalSoldUnits + (info.boxRemainder ?? 0);
        p.totalSoldUnits = totalSoldUnits;
        p.soldByBox = true;
        p.unitsPerBox = info.unitsPerBox;
        p.boxRemainder = info.boxRemainder ?? 0;
        p.totalSold = Math.floor(availableUnits / info.unitsPerBox);
      } else {
        p.totalSoldUnits = p.totalSold;
      }
    }

    return Response.json({
      supplierId: sid,
      dateFrom: fromDate.toISOString(),
      dateTo: toDate.toISOString(),
      totalProducts: result.length,
      totalUnits: result.reduce((s, p) => s + (p.totalSoldUnits ?? p.totalSold), 0),
      products: result,
    });
  } catch (error) {
    console.error("Error getting sales by supplier:", error);
    return Response.json(
      { error: "Error al obtener ventas del proveedor" },
      { status: 500 }
    );
  }
}
