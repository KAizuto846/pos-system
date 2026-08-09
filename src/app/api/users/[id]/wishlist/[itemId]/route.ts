import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logChange } from "@/lib/sync-engine";
import { getDeviceId } from "@/lib/sync-utils";

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
    const userId = parseInt(id, 10);
    const wishlistItemId = parseInt(itemId, 10);
    if (isNaN(userId) || isNaN(wishlistItemId)) {
      return Response.json({ error: "ID inválido" }, { status: 400 });
    }

    const exists = await prisma.userWishlistItem.findFirst({
      where: { id: wishlistItemId, userId },
    });
    if (!exists) {
      return Response.json({ error: "Elemento no encontrado" }, { status: 404 });
    }

    await prisma.userWishlistItem.delete({ where: { id: wishlistItemId } });

    void logChange(getDeviceId(), "DELETE", "userwishlistitem", wishlistItemId, { userId });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting wishlist item:", error);
    return Response.json({ error: "Error al eliminar" }, { status: 500 });
  }
}