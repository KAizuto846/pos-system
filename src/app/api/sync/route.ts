import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ─── GET /api/sync ──────────────────────────────────────────────
// Returns sync status: connected devices, server info, DB stats
export async function GET() {
  try {
    const [productCount, saleCount, userCount, lastSale] = await Promise.all([
      prisma.product.count(),
      prisma.sale.count(),
      prisma.user.count({ where: { active: true } }),
      prisma.sale.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    ]);

    // In a real multi-device setup, we'd track connected devices in a table.
    // For now, return DB stats as sync health indicators.
    return NextResponse.json({
      status: "online",
      serverTime: new Date().toISOString(),
      stats: {
        products: productCount,
        sales: saleCount,
        users: userCount,
        lastSaleAt: lastSale?.createdAt?.toISOString() || null,
      },
      version: "1.0.0",
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: "error", message: error.message || "Sync status failed" },
      { status: 500 }
    );
  }
}

// ─── POST /api/sync ─────────────────────────────────────────────
// Register a device or trigger a data sync
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, deviceName, deviceIP } = body;

    switch (action) {
      case "register": {
        // Register a client device (in production, store in a devices table)
        return NextResponse.json({
          success: true,
          message: `Device "${deviceName || deviceIP}" registered`,
          serverURL: `${request.nextUrl.origin}`,
          syncToken: Buffer.from(`${deviceName}-${Date.now()}`).toString("base64"),
        });
      }

      case "ping": {
        // Simple heartbeat
        return NextResponse.json({
          success: true,
          serverTime: new Date().toISOString(),
        });
      }

      case "export": {
        // Export all business data for sync
        const [products, departments, suppliers, paymentMethods, users] =
          await Promise.all([
            prisma.product.findMany({ include: { department: true, supplier: true } }),
            prisma.department.findMany(),
            prisma.supplier.findMany(),
            prisma.paymentMethod.findMany(),
            prisma.user.findMany({ select: { id: true, username: true, name: true, role: true, active: true } }),
          ]);

        return NextResponse.json({
          success: true,
          exportedAt: new Date().toISOString(),
          data: {
            products,
            departments,
            suppliers,
            paymentMethods,
            users,
          },
        });
      }

      default:
        return NextResponse.json(
          { success: false, message: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Sync failed" },
      { status: 500 }
    );
  }
}
