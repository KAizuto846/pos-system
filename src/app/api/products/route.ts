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

    if (q) {
      const products = await prisma.product.findMany({
        where: {
          OR: [
            { name: { contains: q } },
            { barcode: { contains: q } },
          ],
        },
        include: { department: true, supplier: true },
        orderBy: { name: "asc" },
      });

      return Response.json(products);
    }

    const products = await prisma.product.findMany({
      include: { department: true, supplier: true },
      orderBy: { name: "asc" },
    });

    return Response.json(products);
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
        supplierId: data.supplierId ?? null,
      },
      include: { department: true, supplier: true },
    });

    return Response.json(product, { status: 201 });
  } catch (error) {
    console.error("Error creating product:", error);
    return Response.json({ error: "Error al crear producto" }, { status: 500 });
  }
}
