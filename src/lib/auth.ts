import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { compare } from "bcrypt-ts";
import { prisma } from "@/lib/db";
import { loginSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  // Deriva la URL base del Host de cada request: el login funciona tanto desde
  // localhost como desde http://IP-LAN:PUERTO (acceso desde el teléfono).
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        username: { label: "Usuario" },
        password: { label: "Contraseña", type: "password" },
      },
      authorize: async (credentials) => {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { username, password } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { username },
        });

        if (!user || !user.active) return null;

        const isValid = await compare(password, user.password);
        if (!isValid) return null;

        // Registrar el inicio de sesión en el registro de auditoría
        void logAudit({
          userId: user.id,
          userName: user.name || user.username,
          userRole: user.role,
          action: "login",
          entity: "user",
          entityId: user.id,
          description: `Inicio de sesión de ${user.name || user.username}`,
        });

        return {
          id: String(user.id),
          name: user.name,
          email: user.username,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: string }).role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
});

declare module "next-auth" {
  interface User {
    role?: string;
  }
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      role?: string;
    };
  }
}
