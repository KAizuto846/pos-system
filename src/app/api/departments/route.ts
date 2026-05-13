import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { departmentSchema } from "@/lib/validations";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const departments = await prisma.department.findMany({
      orderBy: { name: "asc" },
    });

    return Response.json(departments);
  } catch (error) {
    console.error("Error listing departments:", error);
    return Response.json({ error: "Error al obtener departamentos" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = departmentSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const department = await prisma.department.create({
      data: {
        name: data.name,
        description: data.description,
        active: data.active,
      },
    });

    return Response.json(department, { status: 201 });
  } catch (error) {
    console.error("Error creating department:", error);
    return Response.json({ error: "Error al crear departamento" }, { status: 500 });
  }
}
