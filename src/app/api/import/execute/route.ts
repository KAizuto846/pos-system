import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export const maxDuration = 120;
export const runtime = 'nodejs';

interface FieldMapping {
  sourceField: string;
  targetField: string;
}

const FIELD_TARGETS = {
  products: ['name', 'barcode', 'price', 'cost', 'stock', 'minStock', 'department', 'supplier', 'supplierPrice'],
  suppliers: ['name', 'contact', 'phone', 'email', 'address'],
  departments: ['name', 'description'],
} as const;

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const entityType = formData.get('entityType') as string || 'products';
    let fieldMappings: FieldMapping[] = [];
    let options = { updateExisting: false, createMissingSuppliers: true, createMissingDepartments: true };

    try {
      const mappingsRaw = formData.get('fieldMappings') as string;
      if (mappingsRaw) fieldMappings = JSON.parse(mappingsRaw);
      const optionsRaw = formData.get('options') as string;
      if (optionsRaw) options = JSON.parse(optionsRaw);
    } catch {
      return NextResponse.json({ error: 'Configuración inválida' }, { status: 400 });
    }

    if (!file) {
      return NextResponse.json({ error: 'No se envió ningún archivo' }, { status: 400 });
    }

    const validEntities = Object.keys(FIELD_TARGETS);
    if (!validEntities.includes(entityType)) {
      return NextResponse.json({ error: `Tipo de entidad no válido: ${entityType}` }, { status: 400 });
    }

    // Build source->target mapping
    const mapping = new Map<string, string>();
    for (const m of fieldMappings) {
      if (m.sourceField && m.targetField) {
        mapping.set(m.sourceField, m.targetField);
      }
    }

    // Parse the file
    const fileName = file.name.toLowerCase();
    const isDBF = fileName.endsWith('.dbf');
    const isCSV = fileName.endsWith('.csv');

    if (!isDBF && !isCSV) {
      return NextResponse.json({ error: 'Formato no soportado' }, { status: 400 });
    }

    let allRows: Record<string, unknown>[] = [];

    if (isDBF) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const tempPath = path.join(os.tmpdir(), `import_exec_${Date.now()}_${file.name}`);
      fs.writeFileSync(tempPath, buffer);

      try {
        const { DBFFile } = await import('dbffile');
        const dbf = await DBFFile.open(tempPath);
        allRows = await dbf.readRecords(20000);

        // Clean data
        allRows = allRows.map((r: Record<string, unknown>) => {
          const cleaned: Record<string, unknown> = {};
          for (const [key, val] of Object.entries(r)) {
            if (Buffer.isBuffer(val)) {
              cleaned[key] = val.toString('utf8').trim();
            } else if (val instanceof Date) {
              cleaned[key] = val.toISOString().split('T')[0];
            } else if (typeof val === 'string') {
              cleaned[key] = val.trim();
            } else {
              cleaned[key] = val;
            }
          }
          return cleaned;
        });
      } finally {
        try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
      }
    } else {
      const text = await file.text();
      const Papa = await import('papaparse');
      const result = Papa.parse(text, { header: true, skipEmptyLines: true });
      allRows = result.data as Record<string, unknown>[];
    }

    // Process rows
    const results = { imported: 0, updated: 0, skipped: 0, errors: 0, errorDetails: [] as string[] };

    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i];
      const rowNum = i + 2;

      try {
        // Map fields
        const mapped: Record<string, unknown> = {};
        for (const [sourceField, targetField] of mapping) {
          let value = row[sourceField];
          if (value !== undefined && value !== null && value !== '') {
            mapped[targetField] = value;
          }
        }

        if (!mapped.name || String(mapped.name).trim() === '') {
          results.skipped++;
          continue;
        }

        switch (entityType) {
          case 'products':
            await processProduct(mapped, options, results);
            break;
          case 'suppliers':
            await processSupplier(mapped, results);
            break;
          case 'departments':
            await processDepartment(mapped, results);
            break;
        }
      } catch (err) {
        results.errors++;
        results.errorDetails.push(`Fila ${rowNum}: ${err instanceof Error ? err.message : 'Error'}`);
      }
    }

    return NextResponse.json({
      success: true,
      imported: results.imported,
      updated: results.updated,
      skipped: results.skipped,
      errors: results.errors,
      errorDetails: results.errorDetails.slice(0, 100),
    });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json(
      { error: `Error de importación: ${error instanceof Error ? error.message : 'Error desconocido'}` },
      { status: 500 }
    );
  }
}

async function processProduct(
  mapped: Record<string, unknown>,
  opts: { updateExisting: boolean; createMissingSuppliers: boolean; createMissingDepartments: boolean },
  results: { imported: number; updated: number; skipped: number; errors: number; errorDetails: string[] }
) {
  const name = String(mapped.name || '').trim();
  if (!name) { results.skipped++; return; }

  // Resolve department by name
  let departmentId: number | null = null;
  if (mapped.department) {
    const deptName = String(mapped.department).trim();
    let dept = await prisma.department.findFirst({
      where: { name: { contains: deptName } },
    });
    if (!dept && opts.createMissingDepartments) {
      dept = await prisma.department.create({ data: { name: deptName } });
    }
    if (dept) departmentId = dept.id;
  }

  // Resolve supplier by name
  let supplierId: number | null = null;
  if (mapped.supplier) {
    const suppName = String(mapped.supplier).trim();
    let supp = await prisma.supplier.findFirst({
      where: { name: { contains: suppName } },
    });
    if (!supp && opts.createMissingSuppliers) {
      supp = await prisma.supplier.create({ data: { name: suppName } });
    }
    if (supp) supplierId = supp.id;
  }

  const barcode = String(mapped.barcode || '').trim();

  // Find existing
  let existing = barcode
    ? await prisma.product.findFirst({ where: { barcode } })
    : null;
  if (!existing) {
    existing = await prisma.product.findFirst({ where: { name } });
  }

  const price = parseFloat(String(mapped.price ?? 0)) || 0;
  const cost = parseFloat(String(mapped.cost ?? 0)) || 0;
  const stock = parseInt(String(mapped.stock ?? 0), 10) || 0;
  const minStock = parseInt(String(mapped.minStock ?? 5), 10) || 5;

  if (existing && opts.updateExisting) {
    await prisma.product.update({
      where: { id: existing.id },
      data: {
        name,
        barcode: barcode || existing.barcode,
        price,
        cost,
        stock,
        minStock,
        departmentId: departmentId ?? existing.departmentId,
        supplierId: supplierId ?? existing.supplierId,
      },
    });
    results.updated++;

    // Update supplier price if provided and supplier exists
    if (supplierId && mapped.supplierPrice) {
      const sp = parseFloat(String(mapped.supplierPrice));
      if (!isNaN(sp) && sp > 0) {
        await prisma.productLine.upsert({
          where: { productId_supplierId: { productId: existing.id, supplierId } },
          create: { productId: existing.id, supplierId, supplierPrice: sp, isPrimary: true },
          update: { supplierPrice: sp },
        });
      }
    }
  } else if (!existing) {
    const product = await prisma.product.create({
      data: { name, barcode, price, cost, stock, minStock, departmentId, supplierId },
    });
    results.imported++;

    // Create ProductLine with supplier price
    if (supplierId && mapped.supplierPrice) {
      const sp = parseFloat(String(mapped.supplierPrice));
      if (!isNaN(sp) && sp > 0) {
        await prisma.productLine.upsert({
          where: { productId_supplierId: { productId: product.id, supplierId } },
          create: { productId: product.id, supplierId, supplierPrice: sp, isPrimary: true },
          update: { supplierPrice: sp },
        });
      }
    }
  } else {
    results.skipped++;
  }
}

async function processSupplier(
  mapped: Record<string, unknown>,
  results: { imported: number; updated: number; skipped: number; errors: number; errorDetails: string[] }
) {
  const name = String(mapped.name || '').trim();
  if (!name) { results.skipped++; return; }

  const existing = await prisma.supplier.findFirst({ where: { name } });

  if (existing) {
    await prisma.supplier.update({
      where: { id: existing.id },
      data: {
        contact: String(mapped.contact ?? existing.contact),
        phone: String(mapped.phone ?? existing.phone),
        email: String(mapped.email ?? existing.email),
        address: String(mapped.address ?? existing.address),
      },
    });
    results.updated++;
  } else {
    await prisma.supplier.create({
      data: {
        name,
        contact: String(mapped.contact ?? ''),
        phone: String(mapped.phone ?? ''),
        email: String(mapped.email ?? ''),
        address: String(mapped.address ?? ''),
      },
    });
    results.imported++;
  }
}

async function processDepartment(
  mapped: Record<string, unknown>,
  results: { imported: number; updated: number; skipped: number; errors: number; errorDetails: string[] }
) {
  const name = String(mapped.name || '').trim();
  if (!name) { results.skipped++; return; }

  const existing = await prisma.department.findFirst({ where: { name } });

  if (existing) {
    if (mapped.description) {
      await prisma.department.update({
        where: { id: existing.id },
        data: { description: String(mapped.description) },
      });
      results.updated++;
    } else {
      results.skipped++;
    }
  } else {
    await prisma.department.create({
      data: { name, description: String(mapped.description ?? '') },
    });
    results.imported++;
  }
}
