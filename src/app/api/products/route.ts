import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { productSchema } from "@/lib/validations";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50")));
    const skip = (page - 1) * limit;
    const departmentId = searchParams.get("departmentId");
    const supplierId = searchParams.get("supplierId");

    const where: Record<string, unknown> = {};

    if (q) {
      where.OR = [
        { name: { contains: q } },
        { barcode: { contains: q } },
      ];
    }

    if (departmentId) {
      where.departmentId = parseInt(departmentId);
    }

    if (supplierId) {
      where.productLines = {
        some: { supplierId: parseInt(supplierId) },
      };
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { department: true, supplier: true, productLines: { include: { supplier: true } } },
        orderBy: { name: "asc" },
        skip,
        take: limit,
      }),
      prisma.product.count({ where }),
    ]);

    return Response.json({
      products,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + limit < total,
      },
    });
  } catch (error) {
    console.error("Error listing products:", error);
    return Response.json({ error: "Error al obtener productos" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = productSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Support both old supplierId and new productLines
    const productLinesData = body.productLines;
    let supplierIdValue: number | null = data.supplierId ?? null;

    // If productLines provided, derive supplierId from primary line
    if (productLinesData && Array.isArray(productLinesData) && productLinesData.length > 0) {
      const primary = productLinesData.find((pl: { isPrimary: boolean }) => pl.isPrimary) || productLinesData[0];
      supplierIdValue = primary.supplierId;
    }

    const product = await prisma.product.create({
      data: {
        name: data.name,
        barcode: data.barcode,
        price: data.price,
        cost: data.cost,
        stock: data.stock,
        minStock: data.minStock,
        active: data.active,
        departmentId: data.departmentId ?? null,
        supplierId: supplierIdValue,
        ...(productLinesData && Array.isArray(productLinesData) && productLinesData.length > 0
          ? {
              productLines: {
                create: productLinesData.map((pl: { supplierId: number; supplierPrice?: number | null; isPrimary?: boolean }) => ({
                  supplierId: pl.supplierId,
                  supplierPrice: pl.supplierPrice ?? null,
                  isPrimary: pl.isPrimary ?? false,
                })),
              },
            }
          : {}),
      },
      include: { department: true, supplier: true, productLines: { include: { supplier: true } } },
    });

    return Response.json(product, { status: 201 });
  } catch (error) {
    console.error("Error creating product:", error);
    return Response.json({ error: "Error al crear producto" }, { status: 500 });
  }
}
