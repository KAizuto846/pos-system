import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { supplierSchema } from "@/lib/validations";
import { broadcast } from "@/lib/broadcast";
import { logChange } from "@/lib/sync-engine";
import { logAudit, getClientIp } from "@/lib/audit";
import { getDeviceId } from "@/lib/sync-utils";

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

    broadcast("supplier:change", { id: supplier.id });
    void logChange(getDeviceId(), "CREATE", "supplier", supplier.id, {
      id: supplier.id,
      name: supplier.name,
      contact: supplier.contact,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      active: supplier.active,
    });
    void logAudit({
      userId: parseInt(session.user.id, 10),
      userName: session.user.name,
      userRole: session.user.role,
      action: "create",
      entity: "supplier",
      entityId: supplier.id,
      description: `Proveedor creado: ${supplier.name}`,
      details: { name: supplier.name, phone: supplier.phone },
      ip: getClientIp(request),
    });
    return Response.json(supplier, { status: 201 });
  } catch (error) {
    console.error("Error creating supplier:", error);
    return Response.json({ error: "Error al crear proveedor" }, { status: 500 });
  }
}
