import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { paymentMethodSchema } from "@/lib/validations";

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
    const paymentMethodId = parseInt(id, 10);

    if (isNaN(paymentMethodId)) {
      return Response.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = await request.json();
    const parsed = paymentMethodSchema.partial().safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.affectsCash !== undefined) updateData.affectsCash = data.affectsCash;
    if (data.active !== undefined) updateData.active = data.active;

    const paymentMethod = await prisma.paymentMethod.update({
      where: { id: paymentMethodId },
      data: updateData,
    });

    return Response.json(paymentMethod);
  } catch (error) {
    console.error("Error updating payment method:", error);
    return Response.json({ error: "Error al actualizar método de pago" }, { status: 500 });
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
    const paymentMethodId = parseInt(id, 10);

    if (isNaN(paymentMethodId)) {
      return Response.json({ error: "ID inválido" }, { status: 400 });
    }

    await prisma.paymentMethod.delete({
      where: { id: paymentMethodId },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting payment method:", error);
    return Response.json({ error: "Error al eliminar método de pago" }, { status: 500 });
  }
}
