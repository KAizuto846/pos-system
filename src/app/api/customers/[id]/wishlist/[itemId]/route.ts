import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logChange } from "@/lib/sync-engine";
import { getDeviceId } from "@/lib/sync-utils";

export const dynamic = "force-dynamic";

// Quitar un producto de la lista de medicamentos de un cliente
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id, itemId } = await params;
    const customerId = parseInt(id, 10);
    const wishlistItemId = parseInt(itemId, 10);
    if (isNaN(customerId) || isNaN(wishlistItemId)) {
      return Response.json({ error: "IDs inválidos" }, { status: 400 });
    }

    const exists = await prisma.customerWishlistItem.findFirst({
      where: { id: wishlistItemId, customerId },
    });
    if (!exists) {
      return Response.json({ error: "Elemento no encontrado" }, { status: 404 });
    }

    await prisma.customerWishlistItem.delete({ where: { id: wishlistItemId } });

    void logChange(getDeviceId(), "DELETE", "customerwishlistitem", wishlistItemId, {
      customerId,
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Error deleting wishlist item:", error);
    return Response.json({ error: "Error al eliminar de la lista" }, { status: 500 });
  }
}