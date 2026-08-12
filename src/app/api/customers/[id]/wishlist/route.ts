import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logChange } from "@/lib/sync-engine";
import { getDeviceId } from "@/lib/sync-utils";
import { broadcast } from "@/lib/broadcast";

// Lista de productos/medicamentos que un cliente necesita
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const customerId = parseInt(id, 10);
    if (isNaN(customerId)) {
      return Response.json({ error: "ID inválido" }, { status: 400 });
    }

    const items = await prisma.customerWishlistItem.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      include: { product: { select: { id: true, name: true, barcode: true, price: true } } },
    });

    return Response.json({ items });
  } catch (error) {
    console.error("Error listing wishlist:", error);
    return Response.json({ error: "Error al obtener la lista" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const customerId = parseInt(id, 10);
    if (isNaN(customerId)) {
      return Response.json({ error: "ID inválido" }, { status: 400 });
    }

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      return Response.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    const body = await request.json();
    const productId = typeof body.productId === "number" ? body.productId : null;
    const name = String(body.name || "").trim();
    const quantity = typeof body.quantity === "number" && body.quantity > 0 ? body.quantity : null;
    const notes = String(body.notes || "").trim();

    if (productId === null && !name) {
      return Response.json({ error: "Debes indicar un producto o un nombre" }, { status: 400 });
    }

    let item;
    if (productId !== null) {
      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product) {
        return Response.json({ error: "Producto no encontrado" }, { status: 404 });
      }
      item = await prisma.customerWishlistItem.create({
        data: { customerId, productId, name: name || product.name, quantity, notes },
      });
    } else {
      item = await prisma.customerWishlistItem.create({
        data: { customerId, productId: null, name, quantity, notes },
      });
    }

    void logChange(getDeviceId(), "CREATE", "customerwishlistitem", item.id, {
      customerId,
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      notes: item.notes,
    });
    broadcast("wishlist:change", { id: item.id });

    return Response.json(item, { status: 201 });
  } catch (error) {
    console.error("Error adding wishlist item:", error);
    return Response.json({ error: "Error al agregar a la lista" }, { status: 500 });
  }
}