import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logChange } from "@/lib/sync-engine";
import { getDeviceId } from "@/lib/sync-utils";
import { logAudit, getClientIp, diffDetails } from "@/lib/audit";
import { NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const customer = await prisma.customer.findUnique({
      where: { id: parseInt(id, 10) },
      include: {
        sales: {
          take: 10,
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!customer) {
      return Response.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    return Response.json(customer);
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, phone, email, fingerprintHash, active } = body;
    const customerId = parseInt(id, 10);
    const beforeCustomer = await prisma.customer.findUnique({ where: { id: customerId } });

    const customer = await prisma.customer.update({
      where: { id: parseInt(id, 10) },
      data: {
        ...(name !== undefined && { name }),
        ...(phone !== undefined && { phone }),
        ...(email !== undefined && { email }),
        ...(fingerprintHash !== undefined && { fingerprintHash }),
        ...(active !== undefined && { active }),
      },
    });

    void logChange(getDeviceId(), "UPDATE", "customer", customerId, {
      ...(name !== undefined && { name }),
      ...(phone !== undefined && { phone }),
      ...(email !== undefined && { email }),
      ...(active !== undefined && { active }),
    });
    void logAudit({
      userId: parseInt(session.user.id, 10),
      userName: session.user.name,
      userRole: session.user.role,
      action: "update",
      entity: "customer",
      entityId: customerId,
      description: `Cliente modificado: ${customer.name || '#' + id}`,
      details: {
        cambios: diffDetails(
          { name: beforeCustomer?.name, phone: beforeCustomer?.phone, email: beforeCustomer?.email, active: beforeCustomer?.active },
          { name: customer.name, phone: customer.phone, email: customer.email, active: customer.active }
        ),
      },
      before: { name: beforeCustomer?.name, phone: beforeCustomer?.phone, email: beforeCustomer?.email, active: beforeCustomer?.active },
      after: { name: customer.name, phone: customer.phone, email: customer.email, active: customer.active },
      ip: getClientIp(request),
    });
    return Response.json({ success: true, customer });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const customerId = parseInt(id, 10);
    const existing = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    await prisma.customer.update({
      where: { id: customerId },
      data: { active: false },
    });

    void logChange(getDeviceId(), "DELETE", "customer", customerId, { active: false });
    void logAudit({
      userId: parseInt(session.user.id, 10),
      userName: session.user.name,
      userRole: session.user.role,
      action: "delete",
      entity: "customer",
      entityId: customerId,
      description: `Cliente eliminado: ${existing?.name || '#' + id}`,
      before: { name: existing?.name, phone: existing?.phone, email: existing?.email, active: existing?.active },
      after: { active: false },
      ip: getClientIp(request),
    });
    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
