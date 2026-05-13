import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { userSchema } from "@/lib/validations";
import { hash } from "bcrypt-ts";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        active: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json(users);
  } catch (error) {
    console.error("Error listing users:", error);
    return Response.json({ error: "Error al obtener usuarios" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = userSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    if (!data.password) {
      return Response.json(
        { error: "La contraseña es requerida" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({
      where: { username: data.username },
    });

    if (existing) {
      return Response.json(
        { error: "El nombre de usuario ya existe" },
        { status: 409 }
      );
    }

    const hashedPassword = await hash(data.password, 10);

    const user = await prisma.user.create({
      data: {
        username: data.username,
        password: hashedPassword,
        name: data.name,
        role: data.role,
        active: data.active,
      },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        active: true,
        createdAt: true,
      },
    });

    return Response.json(user, { status: 201 });
  } catch (error) {
    console.error("Error creating user:", error);
    return Response.json({ error: "Error al crear usuario" }, { status: 500 });
  }
}
