import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

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
    const supplierId = parseInt(id, 10);

    if (isNaN(supplierId)) {
      return Response.json({ error: "ID inválido" }, { status: 400 });
    }

    // Obtener productos con línea de proveedor
    const products = await prisma.product.findMany({
      where: {
        supplierId: supplierId,
        active: true,
      },
      include: {
        department: true,
        supplier: true,
        productLines: {
          where: { supplierId },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    });

    // Formatear respuesta con precio de proveedor si existe
    const result = products.map((p) => ({
      id: p.id,
      name: p.name,
      barcode: p.barcode,
      price: p.price,
      cost: p.cost,
      stock: p.stock,
      minStock: p.minStock,
      department: p.department,
      supplierPrice: p.productLines[0]?.supplierPrice ?? null,
    }));

    return Response.json(result);
  } catch (error) {
    console.error("Error listing supplier products:", error);
    return Response.json({ error: "Error al obtener productos" }, { status: 500 });
  }
}
