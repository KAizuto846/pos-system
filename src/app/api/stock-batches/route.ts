import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    const nearExpiry = searchParams.get("nearExpiry");

    const where: Record<string, unknown> = {};
    if (productId) where.productId = parseInt(productId);
    if (nearExpiry) {
      const days = parseInt(nearExpiry);
      const future = new Date();
      future.setDate(future.getDate() + days);
      where.expiresAt = { not: null, lte: future };
    }

    const batches = await prisma.productBatch.findMany({
      where,
      include: { product: { select: { id: true, name: true, barcode: true } } },
      orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    });

    return Response.json(batches);
  } catch (error) {
    console.error("Error listing stock batches:", error);
    return Response.json({ error: "Error al obtener lotes" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { productId, quantity, expiresAt, batchCode, notes, receivedVia } = body;

    if (!productId || quantity === undefined) {
      return Response.json(
        { error: "productId y quantity son requeridos" },
        { status: 400 }
      );
    }

    const batch = await prisma.$transaction(async (tx) => {
      const newBatch = await tx.productBatch.create({
        data: {
          productId: parseInt(productId),
          quantity: parseInt(quantity),
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          costPrice: 0,
        },
      });

      await tx.product.update({
        where: { id: parseInt(productId) },
        data: { stock: { increment: parseInt(quantity) } },
      });

      return newBatch;
    });

    return Response.json(batch, { status: 201 });
  } catch (error) {
    console.error("Error creating stock batch:", error);
    return Response.json({ error: "Error al crear lote" }, { status: 500 });
  }
}
