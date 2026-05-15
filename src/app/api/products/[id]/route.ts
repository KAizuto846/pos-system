import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { productSchema } from "@/lib/validations";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const productId = parseInt(id, 10);

    if (isNaN(productId)) {
      return Response.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = await request.json();
    const parsed = productSchema.partial().safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.barcode !== undefined) updateData.barcode = data.barcode;
    if (data.price !== undefined) updateData.price = data.price;
    if (data.cost !== undefined) updateData.cost = data.cost;
    if (data.stock !== undefined) updateData.stock = data.stock;
    if (data.minStock !== undefined) updateData.minStock = data.minStock;
    if (data.active !== undefined) updateData.active = data.active;
    if (data.departmentId !== undefined) updateData.departmentId = data.departmentId;
    if (data.supplierId !== undefined) updateData.supplierId = data.supplierId;

    const productLinesData = body.productLines;

    // Use a transaction: update product + replace productLines
    const product = await prisma.$transaction(async (tx) => {
      // Update product fields
      const updated = await tx.product.update({
        where: { id: productId },
        data: updateData,
      });

      // If productLines provided, replace all lines
      if (productLinesData && Array.isArray(productLinesData)) {
        // Delete existing lines
        await tx.productLine.deleteMany({ where: { productId } });

        // Create new lines if any
        if (productLinesData.length > 0) {
          await tx.productLine.createMany({
            data: productLinesData.map((pl: { supplierId: number; supplierPrice?: number | null; isPrimary?: boolean }) => ({
              productId,
              supplierId: pl.supplierId,
              supplierPrice: pl.supplierPrice ?? null,
              isPrimary: pl.isPrimary ?? false,
            })),
          });
        }

        // Update supplierId on product based on primary line
        const primary = productLinesData.find((pl: { isPrimary: boolean }) => pl.isPrimary) || productLinesData[0];
        if (primary) {
          await tx.product.update({
            where: { id: productId },
            data: { supplierId: primary.supplierId },
          });
        } else {
          await tx.product.update({
            where: { id: productId },
            data: { supplierId: null },
          });
        }
      }

      // Return the final product with includes
      return tx.product.findUnique({
        where: { id: productId },
        include: { department: true, supplier: true, productLines: { include: { supplier: true } } },
      });
    });

    return Response.json(product);
  } catch (error) {
    console.error("Error updating product:", error);
    return Response.json({ error: "Error al actualizar producto" }, { status: 500 });
  }
}

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
    const productId = parseInt(id, 10);

    if (isNaN(productId)) {
      return Response.json({ error: "ID inválido" }, { status: 400 });
    }

    await prisma.product.delete({
      where: { id: productId },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting product:", error);
    return Response.json({ error: "Error al eliminar producto" }, { status: 500 });
  }
}
