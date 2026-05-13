import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { departmentSchema } from "@/lib/validations";

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
    const departmentId = parseInt(id, 10);

    if (isNaN(departmentId)) {
      return Response.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = await request.json();
    const parsed = departmentSchema.partial().safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.active !== undefined) updateData.active = data.active;

    const department = await prisma.department.update({
      where: { id: departmentId },
      data: updateData,
    });

    return Response.json(department);
  } catch (error) {
    console.error("Error updating department:", error);
    return Response.json({ error: "Error al actualizar departamento" }, { status: 500 });
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
    const departmentId = parseInt(id, 10);

    if (isNaN(departmentId)) {
      return Response.json({ error: "ID inválido" }, { status: 400 });
    }

    await prisma.department.delete({
      where: { id: departmentId },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting department:", error);
    return Response.json({ error: "Error al eliminar departamento" }, { status: 500 });
  }
}
