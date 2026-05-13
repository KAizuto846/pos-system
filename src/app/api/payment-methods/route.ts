import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { paymentMethodSchema } from "@/lib/validations";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const paymentMethods = await prisma.paymentMethod.findMany({
      orderBy: { name: "asc" },
    });

    return Response.json(paymentMethods);
  } catch (error) {
    console.error("Error listing payment methods:", error);
    return Response.json({ error: "Error al obtener métodos de pago" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = paymentMethodSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const paymentMethod = await prisma.paymentMethod.create({
      data: {
        name: data.name,
        affectsCash: data.affectsCash,
        active: data.active,
      },
    });

    return Response.json(paymentMethod, { status: 201 });
  } catch (error) {
    console.error("Error creating payment method:", error);
    return Response.json({ error: "Error al crear método de pago" }, { status: 500 });
  }
}
