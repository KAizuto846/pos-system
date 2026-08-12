// P2P Sync Engine - Decentralized sync with operation log + LWW conflict resolution

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export interface SyncLogEntry {
  id: number;
  deviceId: string;
  operation: string;
  entity: string;
  entityId: number;
  data: string;
  timestamp: Date | string;
  synced: boolean;
  syncVersion: number;
}

// Log a local change
export async function logChange(
  deviceId: string,
  operation: "CREATE" | "UPDATE" | "DELETE",
  entity: string,
  entityId: number,
  data: unknown
) {
  try {
    await prisma.syncLog.create({
      data: {
        deviceId,
        operation,
        entity,
        entityId,
        data: JSON.stringify(data),
        synced: false,
        syncVersion: BigInt(Date.now()),
      },
    });
  } catch (e) {
    console.error(`[sync] Failed to log change:`, e);
  }
}

// Get unsynced changes for a specific device (not including its own changes)
export async function getUnsyncedChanges(
  excludeDeviceId: string,
  since = 0,
  limit = 500
): Promise<SyncLogEntry[]> {
  const where: Prisma.SyncLogWhereInput = {
    deviceId: { not: excludeDeviceId },
    syncVersion: { gt: BigInt(since) },
  };
  const rows = await prisma.syncLog.findMany({
    where,
    orderBy: { timestamp: "asc" },
    take: Math.min(500, Math.max(1, limit)),
  });
  return rows.map((r) => ({ ...r, syncVersion: Number(r.syncVersion) }));
}

// Get my changes to share with a peer.
// `since` is the per-peer cursor: only changes newer than what the peer already has.
export async function getMyUnsyncedChanges(
  deviceId: string,
  since = 0,
  limit = 500
): Promise<SyncLogEntry[]> {
  const where: Prisma.SyncLogWhereInput = {
    deviceId,
    syncVersion: { gt: BigInt(since) },
  };

  const rows = await prisma.syncLog.findMany({
    where,
    orderBy: { timestamp: "asc" },
    take: Math.min(500, Math.max(1, limit)),
  });
  return rows.map((r) => ({ ...r, syncVersion: Number(r.syncVersion) }));
}

// Mark changes as synced
export async function markSynced(ids: number[]) {
  if (ids.length === 0) return;
  await prisma.syncLog.updateMany({
    where: { id: { in: ids } },
    data: { synced: true },
  });
}

// Apply changes from another device - LWW conflict resolution
export async function applyChanges(changes: SyncLogEntry[], myDeviceId: string) {
  const applied: number[] = [];
  const skipped: number[] = [];
  const errors: { id: number; error: string }[] = [];

  for (const change of changes) {
    // Skip if it's from our own device
    if (change.deviceId === myDeviceId) {
      skipped.push(change.id);
      continue;
    }

    try {
      const data: unknown = JSON.parse(change.data);
      const changeTimestamp = change.timestamp instanceof Date
        ? change.timestamp
        : new Date(change.timestamp);
      if (Number.isNaN(changeTimestamp.getTime())) throw new Error("Invalid change timestamp");
      
      // Check for local conflicting change (LWW = Last Write Wins by timestamp)
      const localConflict = await prisma.syncLog.findFirst({
        where: {
          entity: change.entity,
          entityId: change.entityId,
          deviceId: myDeviceId,
          id: { not: change.id },
        },
        orderBy: { timestamp: "desc" },
      });

      if (localConflict && localConflict.timestamp > changeTimestamp) {
        // Local change is newer, skip remote change but mark it as synced
        skipped.push(change.id);
        continue;
      }

      await applyEntityChange(change.entity, change.operation, change.entityId, data);
      applied.push(change.id);
    } catch (e) {
      errors.push({ id: change.id, error: String(e) });
    }
  }

  // Mark applied and skipped changes as synced
  await markSynced([...applied, ...skipped]);

  return { applied: applied.length, skipped: skipped.length, errors };
}

// Apply a single entity change to the local database
async function applyEntityChange(
  entity: string,
  operation: string,
  entityId: number,
  data: unknown
) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid sync entity data");
  }
  const entityData = data as Record<string, unknown>;

  switch (entity) {
    case "product":
      if (operation === "DELETE") {
        await prisma.product.deleteMany({ where: { id: entityId } });
      } else {
        await prisma.product.upsert({
          where: { id: entityId },
          create: { ...entityData, id: entityId } as Prisma.ProductUncheckedCreateInput,
          update: entityData as Prisma.ProductUncheckedUpdateInput,
        });
      }
      break;

    case "sale":
      if (operation === "CREATE") {
        const { items, ...saleData } = entityData;
        const existing = await prisma.sale.findUnique({ where: { id: entityId } });
        if (!existing) {
          await prisma.sale.create({
            data: {
              ...saleData,
              items: items ? { create: items } : undefined,
            } as Prisma.SaleCreateArgs["data"],
          });
        }
      }
      break;

    case "department":
      if (operation === "DELETE") {
        await prisma.department.deleteMany({ where: { id: entityId } });
      } else {
        await prisma.department.upsert({
          where: { id: entityId },
          create: { ...entityData, id: entityId } as Prisma.DepartmentUncheckedCreateInput,
          update: entityData as Prisma.DepartmentUncheckedUpdateInput,
        });
      }
      break;

    case "supplier":
      if (operation === "DELETE") {
        await prisma.supplier.deleteMany({ where: { id: entityId } });
      } else {
        await prisma.supplier.upsert({
          where: { id: entityId },
          create: { ...entityData, id: entityId } as Prisma.SupplierUncheckedCreateInput,
          update: entityData as Prisma.SupplierUncheckedUpdateInput,
        });
      }
      break;

    case "user":
      if (operation === "DELETE") {
        await prisma.user.deleteMany({ where: { id: entityId } });
      } else {
        await prisma.user.upsert({
          where: { id: entityId },
          create: { ...entityData, id: entityId } as Prisma.UserUncheckedCreateInput,
          update: entityData as Prisma.UserUncheckedUpdateInput,
        });
      }
      break;

    case "paymentmethod":
      if (operation === "DELETE") {
        await prisma.paymentMethod.deleteMany({ where: { id: entityId } });
      } else {
        await prisma.paymentMethod.upsert({
          where: { id: entityId },
          create: { ...entityData, id: entityId } as Prisma.PaymentMethodUncheckedCreateInput,
          update: entityData as Prisma.PaymentMethodUncheckedUpdateInput,
        });
      }
      break;

    case "refund":
      if (operation === "CREATE") {
        const existing = await prisma.refund.findUnique({ where: { id: entityId } });
        if (!existing) {
          await prisma.refund.create({ data: entityData as Prisma.RefundUncheckedCreateInput });
        }
      }
      break;

    case "cashentry":
      if (operation === "CREATE") {
        const existing = await prisma.cashEntry.findUnique({ where: { id: entityId } });
        if (!existing) {
          await prisma.cashEntry.create({ data: entityData as Prisma.CashEntryUncheckedCreateInput });
        }
      }
      break;

    case "order":
      if (operation === "CREATE") {
        const { items: orderItems, ...orderData } = entityData;
        const existing = await prisma.supplierOrder.findUnique({ where: { id: entityId } });
        if (!existing) {
          await prisma.supplierOrder.create({
            data: {
              ...orderData,
              items: orderItems ? { create: orderItems } : undefined,
            } as Prisma.SupplierOrderCreateArgs["data"],
          });
        }
      } else if (operation === "UPDATE") {
        const { items: _ignoredItems, removedItemIds: _ignoredRemoved, ...updateData } = entityData;
        await prisma.supplierOrder.update({
          where: { id: entityId },
          data: updateData as Prisma.SupplierOrderUncheckedUpdateInput,
        });
      }
      break;

    case "supplierorderitem":
      if (operation === "DELETE") {
        await prisma.supplierOrderItem.deleteMany({ where: { id: entityId } });
      } else {
        if (operation === "CREATE") {
          const existing = await prisma.supplierOrderItem.findUnique({ where: { id: entityId } });
          if (!existing) {
            await prisma.supplierOrderItem.create({
              data: { ...entityData, id: entityId } as Prisma.SupplierOrderItemUncheckedCreateInput,
            });
          }
        } else {
          await prisma.supplierOrderItem.updateMany({
            where: { id: entityId },
            data: entityData as Prisma.SupplierOrderItemUncheckedUpdateInput,
          });
        }
      }
      break;

    case "customer":
      if (operation === "DELETE") {
        await prisma.customer.updateMany({
          where: { id: entityId },
          data: { active: false },
        });
      } else {
        await prisma.customer.upsert({
          where: { id: entityId },
          create: { ...entityData, id: entityId } as Prisma.CustomerUncheckedCreateInput,
          update: entityData as Prisma.CustomerUncheckedUpdateInput,
        });
      }
      break;

    case "userwishlistitem":
    case "customerwishlistitem": {
      // Compatibilidad con dispositivos antiguos (0.4.x) que logueaban "userId"
      const clean = { ...entityData };
      delete clean.userId;
      if (operation === "DELETE") {
        await prisma.customerWishlistItem.deleteMany({ where: { id: entityId } });
      } else {
        await prisma.customerWishlistItem.upsert({
          where: { id: entityId },
          create: { ...clean, id: entityId } as Prisma.CustomerWishlistItemUncheckedCreateInput,
          update: clean as Prisma.CustomerWishlistItemUncheckedUpdateInput,
        });
      }
      break;
    }

    case "deliverynotice": {
      // Compatibilidad con dispositivos antiguos (0.4.x) que logueaban "userId"
      const clean = { ...entityData };
      delete clean.userId;
      if (operation === "CREATE") {
        const existing = await prisma.deliveryNotice.findUnique({ where: { id: entityId } });
        if (!existing) {
          await prisma.deliveryNotice.create({
            data: clean as Prisma.DeliveryNoticeUncheckedCreateInput,
          });
        }
      } else if (operation === "UPDATE") {
        await prisma.deliveryNotice.updateMany({
          where: { id: entityId },
          data: clean as Prisma.DeliveryNoticeUncheckedUpdateInput,
        });
      }
      break;
    }

    case "pieceslog":
      if (operation === "CREATE") {
        const existing = await prisma.piecesLog.findUnique({ where: { id: entityId } });
        if (!existing) {
          await prisma.piecesLog.create({
            data: { ...entityData, id: entityId } as Prisma.PiecesLogUncheckedCreateInput,
          });
        }
      } else if (operation === "DELETE") {
        await prisma.piecesLog.deleteMany({ where: { id: entityId } });
      }
      break;
  }
}

// Get latest sync version
export async function getLatestSyncVersion(): Promise<number> {
  const latest = await prisma.syncLog.findFirst({
    orderBy: { syncVersion: "desc" },
    select: { syncVersion: true },
  });
  return latest ? Number(latest.syncVersion) : 0;
}

// Get device statistics
export async function getSyncStats() {
  const [total, unsynced, lastTimestamp] = await Promise.all([
    prisma.syncLog.count(),
    prisma.syncLog.count({ where: { synced: false } }),
    prisma.syncLog.findFirst({
      orderBy: { timestamp: "desc" },
      select: { timestamp: true },
    }),
  ]);

  return {
    totalChanges: total,
    pendingSync: unsynced,
    lastChangeAt: lastTimestamp?.timestamp?.toISOString() || null,
  };
}
