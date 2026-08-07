import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { productSchema } from "@/lib/validations";
import { broadcast } from "@/lib/broadcast";
import { logChange } from "@/lib/sync-engine";
import { getDeviceId } from "@/lib/sync-utils";
import type { Prisma } from "@prisma/client";

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
    const priceMin = searchParams.get("priceMin");
    const priceMax = searchParams.get("priceMax");
    const costMin = searchParams.get("costMin");
    const costMax = searchParams.get("costMax");
    const stockMin = searchParams.get("stockMin");
    const stockMax = searchParams.get("stockMax");
    const minStockMin = searchParams.get("minStockMin");
    const minStockMax = searchParams.get("minStockMax");
    const active = searchParams.get("active");
    const isPosView = searchParams.get("view") === "pos";

    const where: Prisma.ProductWhereInput = {};

    if (q) {
      where.OR = [
        { barcode: { contains: q } },
        { name: { contains: q } },
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

    if (priceMin || priceMax) {
      where.price = {};
      if (priceMin) where.price.gte = parseFloat(priceMin);
      if (priceMax) where.price.lte = parseFloat(priceMax);
    }

    if (costMin || costMax) {
      where.cost = {};
      if (costMin) where.cost.gte = parseFloat(costMin);
      if (costMax) where.cost.lte = parseFloat(costMax);
    }

    if (stockMin || stockMax) {
      where.stock = {};
      if (stockMin) where.stock.gte = parseInt(stockMin);
      if (stockMax) where.stock.lte = parseInt(stockMax);
    }

    if (minStockMin || minStockMax) {
      where.minStock = {};
      if (minStockMin) where.minStock.gte = parseInt(minStockMin);
      if (minStockMax) where.minStock.lte = parseInt(minStockMax);
    }

    if (active === "true") where.active = true;
    if (active === "false") where.active = false;

    const productQuery = isPosView
      ? prisma.product.findMany({
          where,
          select: {
            id: true,
            name: true,
            barcode: true,
            price: true,
            cost: true,
            stock: true,
            minStock: true,
            active: true,
            departmentId: true,
            supplierId: true,
            loyaltyDiscount: true,
          },
          orderBy: { name: "asc" as const },
          skip,
          take: limit,
        })
      : prisma.product.findMany({
          where,
          include: { department: true, supplier: true, productLines: { include: { supplier: true } }, batches: true },
          orderBy: { name: "asc" as const },
          skip,
          take: limit,
        });

    const [products, total] = await Promise.all([
      productQuery,
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

    broadcast("product:create", { id: product.id });
    void logChange(getDeviceId(), "CREATE", "product", product.id, {
      id: product.id,
      name: product.name,
      barcode: product.barcode,
      price: product.price,
      cost: product.cost,
      stock: product.stock,
      minStock: product.minStock,
      active: product.active,
      departmentId: product.departmentId,
      supplierId: product.supplierId,
    });
    return Response.json(product, { status: 201 });
  } catch (error) {
    console.error("Error creating product:", error);
    return Response.json({ error: "Error al crear producto" }, { status: 500 });
  }
}
