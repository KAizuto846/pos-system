import { auth } from "@/lib/auth";
import { checkAndNotifyExpiry } from "@/lib/expiry-checker";

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const result = await checkAndNotifyExpiry();

    return Response.json({
      success: true,
      notificationsCreated: result.created,
      warnings: result.warnings,
    });
  } catch (error) {
    console.error("Error checking expiry:", error);
    return Response.json({ error: "Error al verificar vencimientos" }, { status: 500 });
  }
}
