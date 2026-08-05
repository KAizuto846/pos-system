// GET /api/products/export - Export all products as JSON
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const products = await prisma.product.findMany({
      include: {
        department: { select: { name: true } },
        supplier: { select: { name: true } },
      },
      orderBy: { id: "asc" },
    });

    const exportData = {
      exportVersion: "1.0",
      exportedAt: new Date().toISOString(),
      exportedBy: (session.user as any).username || "admin",
      total: products.length,
      products: products.map((p) => ({
        name: p.name,
        barcode: p.barcode,
        price: p.price,
        cost: p.cost,
        stock: p.stock,
        minStock: p.minStock,
        active: p.active,
        department: p.department?.name || null,
        supplier: p.supplier?.name || null,
      })),
    };

    return new Response(JSON.stringify(exportData, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename=inventario-${new Date().toISOString().split("T")[0]}.json`,
      },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
