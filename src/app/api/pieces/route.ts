import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { detectPiecesFromName } from "@/lib/pieces";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const candidates = await prisma.product.findMany({
      where: {
        active: true,
        OR: [
          { piecesTracked: true },
          { piecesPerUnit: { not: null } },
          { name: { contains: "C/" } },
        ],
      },
      select: {
        id: true,
        name: true,
        barcode: true,
        stock: true,
        price: true,
        cost: true,
        minStock: true,
        piecesPerUnit: true,
        piecesTracked: true,
        pieceChildren: {
          select: {
            id: true,
            name: true,
            barcode: true,
            stock: true,
            price: true,
            cost: true,
            active: true,
          },
          take: 1,
        },
        _count: { select: { piecesLog: true } },
      },
      orderBy: { name: "asc" },
    });

    const boxes = candidates
      .map((box) => {
        const detected = detectPiecesFromName(box.name);
        const isBox =
          box.piecesTracked ||
          box.piecesPerUnit !== null ||
          Boolean(detected);
        if (!isBox) return null;
        const piece = box.pieceChildren[0] ?? null;
        return {
          id: box.id,
          name: box.name,
          barcode: box.barcode,
          stock: box.stock,
          price: box.price,
          cost: box.cost,
          minStock: box.minStock,
          piecesPerUnit: box.piecesPerUnit ?? detected?.pieces ?? null,
          piecesTracked: box.piecesTracked,
          detected: Boolean(detected),
          openedBoxes: box._count.piecesLog,
          piece,
        };
      })
      .filter((box) => box !== null);

    return Response.json({ boxes });
  } catch (error) {
    console.error("Error listing pieces state:", error);
    return Response.json({ error: "Error al obtener piezas" }, { status: 500 });
  }
}