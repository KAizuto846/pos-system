import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/boxes - Lista los productos gestionados por cajas (se piden por
// cajas a los proveedores pero se venden por pieza). No crea productos en
// inventario: las cajas no se venden al público.
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const products = await prisma.product.findMany({
      where: { soldByBox: true },
      select: {
        id: true,
        name: true,
        barcode: true,
        price: true,
        cost: true,
        stock: true,
        minStock: true,
        active: true,
        soldByBox: true,
        unitsPerBox: true,
        boxRemainder: true,
      },
      orderBy: { name: "asc" },
    });

    return Response.json({
      boxes: products.map((p) => ({
        ...p,
        // Las unidades que no completaron caja se convierten a "piezas sobrantes"
        // en términos de cuánto representan respecto a la caja.
        leftoverUnits: p.boxRemainder,
      })),
    });
  } catch (error) {
    console.error("Error listing box-managed products:", error);
    return Response.json({ error: "Error al obtener productos por cajas" }, { status: 500 });
  }
}
