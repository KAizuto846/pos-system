import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

function csvCell(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const entries = await prisma.cashEntry.findMany({
      include: {
        paymentMethod: { select: { name: true } },
        user: { select: { name: true } },
      },
      orderBy: { recordedAt: "asc" },
    });

    const header = ["tipo", "categoria", "monto", "descripcion", "metodo_pago", "usuario", "fecha"];
    const lines = entries.map((e) => [
      e.type,
      e.category,
      e.amount,
      e.description || "",
      e.paymentMethod?.name || "",
      e.user?.name || "",
      e.recordedAt.toISOString(),
    ]);

    const csv = [header, ...lines].map((row) => row.map(csvCell).join(",")).join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="finanzas-${Date.now()}.csv"`,
      },
    });
  } catch (error) {
    console.error("Finance CSV export error:", error);
    return Response.json({ error: "Error al exportar CSV" }, { status: 500 });
  }
}