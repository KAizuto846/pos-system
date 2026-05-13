import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { supplierSchema } from "@/lib/validations";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const suppliers = await prisma.supplier.findMany({
      orderBy: { name: "asc" },
    });

    return Response.json(suppliers);
  } catch (error) {
    console.error("Error listing suppliers:", error);
    return Response.json({ error: "Error al obtener proveedores" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = supplierSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const supplier = await prisma.supplier.create({
      data: {
        name: data.name,
        contact: data.contact,
        phone: data.phone,
        email: data.email ?? "",
        address: data.address,
        active: data.active,
      },
    });

    return Response.json(supplier, { status: 201 });
  } catch (error) {
    console.error("Error creating supplier:", error);
    return Response.json({ error: "Error al crear proveedor" }, { status: 500 });
  }
}
