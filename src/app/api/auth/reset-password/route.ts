import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcrypt-ts";
import { prisma } from "@/lib/db";
import { resetPasswordSchema } from "@/lib/validations";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { token, password } = parsed.data;

    const user = await prisma.user.findFirst({
      where: { passwordResetToken: token },
    });

    if (!user || !user.passwordResetExpires || user.passwordResetExpires < new Date()) {
      return NextResponse.json(
        { error: "El enlace es inválido o ha expirado. Solicita uno nuevo." },
        { status: 400 }
      );
    }

    const hashed = await hash(password, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });

    return NextResponse.json({ message: "Contraseña actualizada. Ya puedes iniciar sesión." });
  } catch (error) {
    console.error("reset-password error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
