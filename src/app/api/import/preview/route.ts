import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { decodeTextBuffer } from '@/lib/import-decode';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No se envió ningún archivo' }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const isDBF = fileName.endsWith('.dbf');
    const isCSV = fileName.endsWith('.csv');
    const isXLSX = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
    const isJSON = fileName.endsWith('.json');

    if (!isDBF && !isCSV && !isXLSX && !isJSON) {
      return NextResponse.json(
        { error: 'Formato no soportado. Solo se aceptan archivos .dbf, .csv, .xlsx, .xls o .json' },
        { status: 400 }
      );
    }

    let columns: string[] = [];
    let rows: Record<string, unknown>[] = [];
    let fileType: 'dbf' | 'csv' | 'xlsx' | 'json' = 'csv';

    if (isDBF) {
      fileType = 'dbf';
      const buffer = Buffer.from(await file.arrayBuffer());
      const tempPath = path.join(os.tmpdir(), `import_${Date.now()}_${file.name}`);
      fs.writeFileSync(tempPath, buffer);

      try {
        const { DBFFile } = await import('dbffile');
        const dbf = await DBFFile.open(tempPath);
        columns = dbf.fields.map((f: { name: string }) => f.name);
        const records = await dbf.readRecords(2000);
        rows = records.map((r: Record<string, unknown>) => {
          const cleaned: Record<string, unknown> = {};
          for (const [key, val] of Object.entries(r)) {
            if (Buffer.isBuffer(val)) {
              cleaned[key] = decodeTextBuffer(val).trim();
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
      fileType = 'xlsx';
      const buffer = Buffer.from(await file.arrayBuffer());
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet);
      columns = Object.keys(data[0] || {});
      rows = data as Record<string, unknown>[];
    } else if (isJSON) {
      fileType = 'json';
      const text = await file.text();
      const parsed = JSON.parse(text);
      const data = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.products)
          ? parsed.products
          : [];
      rows = data as Record<string, unknown>[];
      columns = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
    } else {
      fileType = 'csv';
      const buffer = Buffer.from(await file.arrayBuffer());
      const text = decodeTextBuffer(buffer);
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
        dynamicTyping: false,
        delimiter: detectDelimiter(text),
      });

      if (result.errors.length > 0) {
        console.warn('CSV parse warnings:', result.errors.filter(e => (e as { type?: string }).type === 'warning'));
      }

      columns = result.meta.fields || [];
      rows = result.data as Record<string, unknown>[];
    }

    const previewRows = rows.slice(0, 50);

    return NextResponse.json({
      columns,
      totalRows: rows.length,
      previewRows,
      fileName: file.name,
      fileType,
    });
  } catch (error) {
    console.error('Preview error:', error);
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: `Error al procesar el archivo: ${message}` }, { status: 500 });
  }
}
