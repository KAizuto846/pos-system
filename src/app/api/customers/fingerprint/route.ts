import { prisma } from "@/lib/prisma";

// POST /api/customers/fingerprint - Verify fingerprint (simulated)
// Body: { fingerprintData: string }
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fingerprintData, action } = body;

    if (action === "verify" && fingerprintData) {
      // For simulated mode: search by name since we use a simple hash
      // In production with real hardware, this would compare actual fingerprint templates
      const customers = await prisma.customer.findMany({
        where: {
          active: true,
          fingerprintHash: { not: null },
        },
        select: { id: true, name: true, fingerprintHash: true, tier: true, purchaseCount: true },
      });

      if (customers.length === 0) {
        return Response.json({ found: false, message: "No hay clientes registrados con huella" });
      }

      // Simulated: return first matching hash (in production, hardware SDK handles matching)
      const match = customers.find(c => c.fingerprintHash === fingerprintData);

      if (match) {
        return Response.json({
          found: true,
          customer: {
            id: match.id,
            name: match.name,
            tier: match.tier,
            purchaseCount: match.purchaseCount,
          },
        });
      }

      return Response.json({ found: false, message: "Huella no reconocida" });
    }

    if (action === "enroll" && fingerprintData) {
      const { customerId } = body;
      if (!customerId) {
        return Response.json({ error: "customerId requerido" }, { status: 400 });
      }

      await prisma.customer.update({
        where: { id: customerId },
        data: { fingerprintHash: fingerprintData },
      });

      return Response.json({ success: true, message: "Huella registrada correctamente" });
    }

    return Response.json({ error: "Accion no valida. Usa verify o enroll" }, { status: 400 });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
