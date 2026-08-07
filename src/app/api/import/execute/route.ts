import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import type { Prisma } from '@prisma/client';

export const maxDuration = 300;
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

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ROWS = 20_000;
const BATCH_SIZE = 200;

interface ImportResults {
  imported: number;
  updated: number;
  skipped: number;
  errors: number;
  errorDetails: string[];
}

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
      return NextResponse.json({ error: 'Configuracion invalida' }, { status: 400 });
    }

    if (!file) {
      return NextResponse.json({ error: 'No se envio ningun archivo' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'El archivo excede el limite de 10 MB' }, { status: 413 });
    }

    const validEntities = Object.keys(FIELD_TARGETS);
    if (!validEntities.includes(entityType)) {
      return NextResponse.json({ error: `Tipo de entidad no valido: ${entityType}` }, { status: 400 });
    }

    const mapping = new Map<string, string>();
    for (const m of fieldMappings) {
      if (m.sourceField && m.targetField) {
        mapping.set(m.sourceField, m.targetField);
      }
    }

    const fileName = file.name.toLowerCase();
    const isDBF = fileName.endsWith('.dbf');
    const isCSV = fileName.endsWith('.csv');
    const isXLSX = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
    const isJSON = fileName.endsWith('.json');

    if (!isDBF && !isCSV && !isXLSX && !isJSON) {
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
        allRows = await dbf.readRecords(MAX_ROWS + 1);

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
    } else if (isXLSX) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet);
      allRows = data as Record<string, unknown>[];
    } else if (isJSON) {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const data = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.products)
          ? parsed.products
          : [];
      allRows = data as Record<string, unknown>[];
    } else {
      const text = await file.text();
      const Papa = await import('papaparse');
      const detectDelimiter = (content: string): string => {
        const firstLine = content.split('\n')[0];
        const pipeCount = (firstLine.match(/\|/g) || []).length;
        const commaCount = (firstLine.match(/,/g) || []).length;
        return pipeCount >= commaCount ? '|' : ',';
      };
      const result = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        delimiter: detectDelimiter(text),
      });
      allRows = result.data as Record<string, unknown>[];
    }

    if (allRows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `El archivo excede el limite de ${MAX_ROWS} filas` },
        { status: 413 }
      );
    }

    const results: ImportResults = {
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      errorDetails: [],
    };

    // Pre-cache departments and suppliers for fast product processing
    const [deptList, suppList] = await Promise.all([
      prisma.department.findMany({ select: { id: true, name: true } }),
      prisma.supplier.findMany({ select: { id: true, name: true } }),
    ]);
    const deptCache = new Map<string, number>(deptList.map(d => [d.name, d.id]));
    const suppCache = new Map<string, number>(suppList.map(s => [s.name, s.id]));

    const createBatch: Prisma.ProductCreateManyInput[] = [];

    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i];
      const rowNum = i + 2;

      try {
        const mapped: Record<string, unknown> = {};
        for (const [sourceField, targetField] of mapping) {
          const value = row[sourceField];
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
            await processProductBatch(mapped, options, results, deptCache, suppCache, createBatch, BATCH_SIZE);
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

    // Flush remaining batch
    if (createBatch.length > 0) {
      await flushProductBatch(createBatch, results);
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
      { error: `Error de importacion: ${error instanceof Error ? error.message : 'Error desconocido'}` },
      { status: 500 }
    );
  }
}

async function processProductBatch(
  mapped: Record<string, unknown>,
  opts: { updateExisting: boolean; createMissingSuppliers: boolean; createMissingDepartments: boolean },
  results: ImportResults,
  deptCache: Map<string, number>,
  suppCache: Map<string, number>,
  createBatch: Prisma.ProductCreateManyInput[],
  batchSize: number
) {
  const name = String(mapped.name || '').trim();
  if (!name) { results.skipped++; return; }

  let departmentId: number | null = null;
  if (mapped.department) {
    const deptName = String(mapped.department).trim();
    let deptId = deptCache.get(deptName);
    if (!deptId && opts.createMissingDepartments) {
      const dept = await prisma.department.create({ data: { name: deptName } });
      deptCache.set(deptName, dept.id);
      deptId = dept.id;
    }
    if (deptId) departmentId = deptId;
  }

  let supplierId: number | null = null;
  if (mapped.supplier) {
    const suppName = String(mapped.supplier).trim();
    let suppId = suppCache.get(suppName);
    if (!suppId && opts.createMissingSuppliers) {
      const supp = await prisma.supplier.create({ data: { name: suppName } });
      suppCache.set(suppName, supp.id);
      suppId = supp.id;
    }
    if (suppId) supplierId = suppId;
  }

  let barcode = String(mapped.barcode || '').trim();
  barcode = barcode.replace(/[^\x20-\x7E]/g, '').trim();
  if (barcode && (
    barcode.length > 25 ||
    barcode.length > 3 && /^[A-Za-z]\s\.\,\\-]+$/.test(barcode) ||
    [...barcode].filter(c => /\d/.test(c)).length < barcode.length * 0.3
  )) {
    barcode = '';
  }

  const price = parseFloat(String(mapped.price ?? 0)) || 0;
  const cost = parseFloat(String(mapped.cost ?? 0)) || 0;
  const stock = parseInt(String(mapped.stock ?? 0), 10) || 0;
  const minStock = parseInt(String(mapped.minStock ?? 5), 10) || 5;
  const active = mapped.active !== undefined
    ? String(mapped.active).toLowerCase() === 'si' || String(mapped.active).toLowerCase() === 'true' || String(mapped.active) === '1'
    : true;

  // Actualizar registros existentes: se busca por código de barras
  // (o por nombre exacto si no hay código) cuando la opción está activa
  if (opts.updateExisting) {
    let existing = null;
    if (barcode) {
      existing = await prisma.product.findFirst({ where: { barcode } });
    }
    if (!existing && name) {
      existing = await prisma.product.findFirst({ where: { name } });
    }

    if (existing) {
      await prisma.product.update({
        where: { id: existing.id },
        data: {
          name,
          ...(barcode ? { barcode } : {}),
          price,
          cost,
          stock,
          minStock,
          active,
          ...(departmentId !== null ? { departmentId } : {}),
          ...(supplierId !== null ? { supplierId } : {}),
        },
      });
      results.updated++;
      return;
    }
  }

  createBatch.push({
    name, barcode, price, cost, stock, minStock, active,
    departmentId: departmentId || null,
    supplierId: supplierId || null,
  });
  if (createBatch.length >= batchSize) {
    await flushProductBatch(createBatch, results);
  }
}

async function flushProductBatch(
  createBatch: Prisma.ProductCreateManyInput[],
  results: ImportResults
) {
  const batch = createBatch.splice(0, createBatch.length);
  try {
    const inserted = await prisma.product.createMany({ data: batch });
    results.imported += inserted.count;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al insertar lote';
    results.errors += batch.length;
    results.errorDetails.push(`Lote de ${batch.length} productos: ${message}`);
    console.error('Product import batch failed:', error);
  }
}

async function processSupplier(
  mapped: Record<string, unknown>,
  results: ImportResults
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
  results: ImportResults
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
