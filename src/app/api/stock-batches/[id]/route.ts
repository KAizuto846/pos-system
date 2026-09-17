import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const batchId = parseInt(id, 10);
    if (isNaN(batchId)) {
      return Response.json({ error: "ID inválido" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      const batch = await tx.productBatch.findUnique({ where: { id: batchId } });
      if (!batch) throw new Error("Lote no encontrado");

      await tx.product.update({
        where: { id: batch.productId },
        data: { stock: { decrement: batch.quantity } },
      });

      await tx.productBatch.delete({ where: { id: batchId } });
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting stock batch:", error);
    const message = error instanceof Error ? error.message : "Error al eliminar lote";
    const status = message.includes("no encontrado") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
