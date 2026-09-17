import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { forgotPasswordSchema } from "@/lib/validations";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const identifier = parsed.data.identifier.trim();

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ username: identifier }, { recoveryEmail: identifier }],
      },
    });

    // Respuesta genérica para no enumerar usuarios
    const genericOk = {
      message:
        "Si el usuario existe, se generó un enlace de recuperación válido por 60 minutos.",
    };

    if (!user) {
      return NextResponse.json(genericOk);
    }

    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: token, passwordResetExpires: expires },
    });

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.AUTH_URL ||
      "http://localhost:3001";
    const resetUrl = `${baseUrl.replace(/\/$/, "")}/reset-password?token=${token}`;

    console.log(
      `[forgot-password] user=${user.username} id=${user.id} token=${token} url=${resetUrl} expires=${expires.toISOString()}`
    );

    // En desarrollo mostramos el token/url para que puedas recuperar sin email.
    // Si en el futuro configuras SMTP, aquí se enviaría el email a user.recoveryEmail.
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json({
        ...genericOk,
        // solo en dev
        _dev_token: token,
        _dev_resetUrl: resetUrl,
        _dev_hint:
          "Abre ese link para poner una nueva contraseña. En producción esto se enviaría por email a tu correo de recuperación.",
      });
    }

    return NextResponse.json(genericOk);
  } catch (error) {
    console.error("forgot-password error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
