// POST /api/products/delete-all - Delete all business data with admin password confirmation
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { compare } from "bcrypt-ts";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = parseInt(session.user.id, 10);
    if (isNaN(userId)) {
      return Response.json({ error: "Usuario inválido" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || user.role !== "ADMIN") {
      return Response.json(
        { error: "Solo los administradores pueden eliminar todo" },
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

    // Delete all business data in correct order to respect foreign keys.
    // Se conservan: usuarios, métodos de pago, departamentos y proveedores.
    const deleted = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const counts: Record<string, number> = {};

      counts.saleItems = (await tx.saleItem.deleteMany()).count;
      counts.refunds = (await tx.refund.deleteMany()).count;
      counts.cashEntries = (await tx.cashEntry.deleteMany()).count;
      counts.sales = (await tx.sale.deleteMany()).count;
      counts.orderItems = (await tx.supplierOrderItem.deleteMany()).count;
      counts.orders = (await tx.supplierOrder.deleteMany()).count;
      counts.productLines = (await tx.productLine.deleteMany()).count;
      counts.products = (await tx.product.deleteMany()).count;
      counts.customers = (await tx.customer.deleteMany()).count;
      counts.shiftReports = (await tx.shiftReport.deleteMany()).count;

      return counts;
    });

    return Response.json({
      success: true,
      message: `Se eliminaron ${deleted.products} productos, ${deleted.sales} ventas, ${deleted.orders} pedidos, ${deleted.customers} clientes, ${deleted.cashEntries} movimientos de caja y ${deleted.shiftReports} reportes de turno`,
      deleted,
    });
  } catch (error) {
    console.error("Delete all error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Error al eliminar los datos" },
      { status: 500 }
    );
  }
}
