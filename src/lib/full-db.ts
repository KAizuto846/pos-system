import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export const runtime = 'nodejs';

interface FullDbDump {
  ok: boolean;
  exportedAt: string;
  data: Record<string, unknown[]>;
}

const DATE_FIELDS: Record<string, string[]> = {
  user: ['createdAt', 'updatedAt'],
  department: ['createdAt', 'updatedAt'],
  supplier: ['createdAt', 'updatedAt'],
  paymentMethod: ['createdAt', 'updatedAt'],
  customer: ['lastPurchaseAt', 'createdAt', 'updatedAt'],
  product: ['createdAt', 'updatedAt'],
  productBatch: ['expiresAt', 'createdAt'],
  productLine: ['createdAt'],
  sale: ['createdAt'],
  saleItem: [],
  supplierOrder: ['createdAt', 'updatedAt', 'sentAt'],
  supplierOrderItem: ['createdAt', 'updatedAt'],
  cashEntry: ['recordedAt', 'createdAt'],
  refund: ['createdAt'],
  shiftReport: ['startDate', 'endDate', 'createdAt'],
};

// Orden de borrado: hijos antes que padres (integridad referencial)
const DELETE_ORDER = [
  'saleItem',
  'refund',
  'cashEntry',
  'supplierOrderItem',
  'supplierOrder',
  'productLine',
  'productBatch',
  'product',
  'sale',
  'shiftReport',
  'customer',
  'paymentMethod',
  'supplier',
  'department',
  'user',
] as const;

const CREATE_ORDER = [
  'user',
  'department',
  'supplier',
  'paymentMethod',
  'customer',
  'product',
  'productBatch',
  'productLine',
  'sale',
  'saleItem',
  'supplierOrder',
  'supplierOrderItem',
  'cashEntry',
  'refund',
  'shiftReport',
] as const;

// Modelo (singular) → clave del dump (plural)
const DUMP_KEYS: Record<string, string> = {
  user: 'users',
  department: 'departments',
  supplier: 'suppliers',
  paymentMethod: 'paymentMethods',
  customer: 'customers',
  product: 'products',
  productBatch: 'productBatches',
  productLine: 'productLines',
  sale: 'sales',
  saleItem: 'saleItems',
  supplierOrder: 'supplierOrders',
  supplierOrderItem: 'supplierOrderItems',
  cashEntry: 'cashEntries',
  refund: 'refunds',
  shiftReport: 'shiftReports',
};

export async function dumpFullDb(): Promise<FullDbDump> {
  const [users, departments, suppliers, paymentMethods, customers, products, productBatches, productLines, sales, saleItems, supplierOrders, supplierOrderItems, cashEntries, refunds, shiftReports] = await Promise.all([
    prisma.user.findMany(),
    prisma.department.findMany(),
    prisma.supplier.findMany(),
    prisma.paymentMethod.findMany(),
    prisma.customer.findMany(),
    prisma.product.findMany(),
    prisma.productBatch.findMany(),
    prisma.productLine.findMany(),
    prisma.sale.findMany(),
    prisma.saleItem.findMany(),
    prisma.supplierOrder.findMany(),
    prisma.supplierOrderItem.findMany(),
    prisma.cashEntry.findMany(),
    prisma.refund.findMany(),
    prisma.shiftReport.findMany(),
  ]);

  return {
    ok: true,
    exportedAt: new Date().toISOString(),
    data: {
      users,
      departments,
      suppliers,
      paymentMethods,
      customers,
      products,
      productBatches,
      productLines,
      sales,
      saleItems,
      supplierOrders,
      supplierOrderItems,
      cashEntries,
      refunds,
      shiftReports,
    },
  };
}

function toCreateData(row: Record<string, unknown>, dateFields: string[]) {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null) {
      data[key] = null;
    } else if (dateFields.includes(key)) {
      data[key] = typeof value === 'string' ? new Date(value) : value;
    } else {
      data[key] = value;
    }
  }
  return data;
}

export async function restoreFullDb(dump: FullDbDump) {
  const data = dump?.data;
  if (!data || typeof data !== 'object') {
    throw new Error('Base de datos inválida');
  }

  const counts: Record<string, number> = {};
  const rest = { ...data };

  const table = (tx: Prisma.TransactionClient, name: string) =>
    (tx as unknown as Record<string, { deleteMany: (args: unknown) => Promise<{ count: number }>; createMany: (args: { data: unknown[] }) => Promise<{ count: number }> }>)[name];

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // 1) Vaciar todo (hijos primero)
    for (const modelName of DELETE_ORDER) {
      await table(tx, modelName).deleteMany({});
    }

    // 2) Recrear (padres primero) conservando los IDs originales
    for (const modelName of CREATE_ORDER) {
      const rows = (rest[DUMP_KEYS[modelName]] ?? []) as Record<string, unknown>[];
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const created = await table(tx, modelName).createMany({
        data: rows.map((row) => toCreateData(row, DATE_FIELDS[modelName])),
      });
      counts[modelName] = created.count;
    }
  });

  return counts;
}
