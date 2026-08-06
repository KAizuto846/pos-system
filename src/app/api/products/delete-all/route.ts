// POST /api/products/delete-all - Delete all products with admin password confirmation
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { compare } from "bcrypt-ts";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || user.role !== "admin") {
      return Response.json(
        { error: "Solo los administradores pueden eliminar todo el inventario" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { password } = body;

    if (!password) {
      return Response.json(
        { error: "Se requiere la contrasena para confirmar" },
        { status: 400 }
      );
    }

    // Verify admin password
    const valid = await compare(password, user.password);
    if (!valid) {
      return Response.json(
        { error: "Contrasena incorrecta" },
        { status: 403 }
      );
    }

    // Delete in correct order to respect foreign keys
    const deleted = await prisma.$transaction(async (tx: any) => {
      const count = await tx.product.count();
      if (count === 0) {
        return { products: 0, saleItems: 0, productLines: 0, refunds: 0, orderItems: 0 };
      }

      const productIds = await tx.product.findMany({ select: { id: true } });
      const ids = productIds.map((p: { id: number }) => p.id);

      const saleItems = await tx.saleItem.deleteMany({
        where: { productId: { in: ids } },
      });

      const orderItems = await tx.supplierOrderItem.deleteMany({
        where: { productId: { in: ids } },
      });

      const refunds = await tx.refund.deleteMany({
        where: { productId: { in: ids } },
      });

      const productLines = await tx.productLine.deleteMany({
        where: { productId: { in: ids } },
      });

      const products = await tx.product.deleteMany({
        where: { id: { in: ids } },
      });

      return {
        products: products.count,
        saleItems: saleItems.count,
        orderItems: orderItems.count,
        refunds: refunds.count,
        productLines: productLines.count,
      };
    });

    return Response.json({
      success: true,
      message: `Se eliminaron ${deleted.products} productos y ${deleted.saleItems + deleted.orderItems + deleted.refunds + deleted.productLines} registros relacionados`,
      deleted,
    });
  } catch (error: any) {
    console.error("Delete all error:", error);
    return Response.json(
      { error: error.message || "Error al eliminar inventario" },
      { status: 500 }
    );
  }
}
