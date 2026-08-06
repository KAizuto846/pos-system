import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logChange } from "@/lib/sync-engine";
import { getDeviceId } from "@/lib/sync-utils";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "";
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const where: any = { active: true };
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { phone: { contains: q } },
        { email: { contains: q } },
      ];
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { purchaseCount: "desc" },
        take: limit,
      }),
      prisma.customer.count({ where }),
    ]);

    return Response.json({ customers, total });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { name, phone, email, fingerprintHash } = body;

    if (!name || !name.trim()) {
      return Response.json({ error: "Nombre requerido" }, { status: 400 });
    }

    const existing = await prisma.customer.findFirst({
      where: {
        active: true,
        name: { equals: name.trim() },
      },
    });

    if (existing) {
      return Response.json({ error: "Ya existe un cliente con ese nombre" }, { status: 400 });
    }

    const customer = await prisma.customer.create({
      data: {
        name: name.trim(),
        phone: phone || "",
        email: email || "",
        fingerprintHash: fingerprintHash || null,
      },
    });

    void logChange(getDeviceId(), "CREATE", "customer", customer.id, {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
    });
    return Response.json({ success: true, customer });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
