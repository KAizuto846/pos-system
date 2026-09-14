import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recoveryEmailSchema } from "@/lib/validations";

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = recoveryEmailSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const userId = parseInt(session.user.id, 10);

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { recoveryEmail: parsed.data.recoveryEmail || null },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        recoveryEmail: true,
        active: true,
        createdAt: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("recovery-email error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = parseInt(session.user.id, 10);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { recoveryEmail: true },
    });

    return NextResponse.json({ recoveryEmail: user?.recoveryEmail || "" });
  } catch (error) {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
