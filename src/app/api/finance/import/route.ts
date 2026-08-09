import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logChange } from "@/lib/sync-engine";
import { getDeviceId } from "@/lib/sync-utils";

const VALID_CATEGORIES: Record<string, string[]> = {
  INCOME: ["manual_deposit", "other"],
  EXPENSE: ["profit_withdrawal", "profit_cost_withdrawal", "operating_expense", "purchase", "other"],
  TRANSFER: ["transfer"],
};

// Parsea una línea CSV respetando comillas y comas internas
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

function parseDate(value: string): Date | null {
  const v = value.trim();
  if (!v) return null;
  const iso = new Date(v);
  if (!isNaN(iso.getTime())) return iso;
  // DD/MM/YYYY [HH:mm[:ss]]
  const dmy = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(?:(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmy) {
    const [, d, m, y, hh, mm, ss] = dmy;
    const date = new Date(
      parseInt(y, 10),
      parseInt(m, 10) - 1,
      parseInt(d, 10),
      hh ? parseInt(hh, 10) : 12,
      mm ? parseInt(mm, 10) : 0,
      ss ? parseInt(ss, 10) : 0
    );
    return isNaN(date.getTime()) ? null : date;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return Response.json({ error: "Solo administradores" }, { status: 403 });
    }

    const body = await request.json();
    const raw = String(body.csv || "").replace(/^\uFEFF/, "").trim();
    if (!raw) {
      return Response.json({ error: "CSV vacío" }, { status: 400 });
    }

    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    let start = 0;
    const first = parseCsvLine(lines[0]).map((c) => c.trim().toLowerCase());
    const isHeader =
      first.includes("tipo") && (first.includes("monto") || first.includes("categoria"));
    if (isHeader) start = 1;

    const paymentMethods = await prisma.paymentMethod.findMany();
    const pmByName = new Map(paymentMethods.map((p) => [p.name.toLowerCase(), p]));
    const userId = parseInt(session.user.id, 10);

    const created: number[] = [];
    const errors: Array<{ row: number; reason: string }> = [];

    for (let i = start; i < lines.length; i++) {
      const cells = parseCsvLine(lines[i]).map((c) => c.trim());
      const [typeRaw, categoryRaw, amountRaw, description, methodRaw, , dateRaw] = cells;
      try {
        const type = (typeRaw || "").toUpperCase();
        if (!VALID_CATEGORIES[type]) {
          errors.push({ row: i + 1, reason: `Tipo inválido: ${typeRaw || "(vacío)"}` });
          continue;
        }
        const category = (categoryRaw || "").trim();
        if (!VALID_CATEGORIES[type].includes(category)) {
          errors.push({ row: i + 1, reason: `Categoría inválida: ${categoryRaw || "(vacío)"}` });
          continue;
        }
        const amount = parseFloat(amountRaw);
        if (isNaN(amount) || amount <= 0) {
          errors.push({ row: i + 1, reason: `Monto inválido: ${amountRaw || "(vacío)"}` });
          continue;
        }
        const method = methodRaw ? pmByName.get(methodRaw.toLowerCase()) : undefined;
        const recordedAt = dateRaw ? parseDate(dateRaw) : null;

        const entry = await prisma.cashEntry.create({
          data: {
            type,
            category,
            amount,
            description: description || "",
            paymentMethodId: method?.id ?? null,
            userId,
            recordedAt: recordedAt ?? new Date(),
          },
        });
        created.push(entry.id);
        void logChange(getDeviceId(), "CREATE", "cashentry", entry.id, {
          id: entry.id,
          type: entry.type,
          category: entry.category,
          amount: entry.amount,
          description: entry.description,
          paymentMethodId: entry.paymentMethodId,
          userId: entry.userId,
          recordedAt: entry.recordedAt,
        });
      } catch (error) {
        console.error(`CSV import row ${i + 1}:`, error);
        errors.push({ row: i + 1, reason: "Error al crear el registro" });
      }
    }

    return Response.json({
      created: created.length,
      errors,
      message: `Se importaron ${created.length} registros${errors.length > 0 ? `, ${errors.length} con errores` : ""}`,
    });
  } catch (error) {
    console.error("Finance CSV import error:", error);
    return Response.json({ error: "Error al importar CSV" }, { status: 500 });
  }
}