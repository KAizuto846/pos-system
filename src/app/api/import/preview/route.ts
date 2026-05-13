import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No se envió ningún archivo' }, { status: 400 });
    }

    // Detect file type
    const fileName = file.name.toLowerCase();
    const isDBF = fileName.endsWith('.dbf');
    const isCSV = fileName.endsWith('.csv');

    if (!isDBF && !isCSV) {
      return NextResponse.json(
        { error: 'Formato no soportado. Solo se aceptan archivos .dbf o .csv' },
        { status: 400 }
      );
    }

    let columns: string[] = [];
    let rows: Record<string, unknown>[] = [];

    if (isDBF) {
      // Save to temp file for dbffile parsing
      const buffer = Buffer.from(await file.arrayBuffer());
      const tempPath = path.join(os.tmpdir(), `import_${Date.now()}_${file.name}`);
      fs.writeFileSync(tempPath, buffer);

      try {
        // Dynamically import dbffile (ESM module)
        const { DBFFile } = await import('dbffile');
        const dbf = await DBFFile.open(tempPath);

        // Get columns
        columns = dbf.fields.map((f: { name: string }) => f.name);

        // Read all records (limit to 2000 for preview)
        const records = await dbf.readRecords(2000);
        rows = records.map((r: Record<string, unknown>) => {
          const cleaned: Record<string, unknown> = {};
          for (const [key, val] of Object.entries(r)) {
            // Convert buffers and dates to strings
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
        // Clean up temp file
        try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
      }
    } else {
      // CSV parsing
      const text = await file.text();
      const Papa = await import('papaparse');
      const result = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
      });

      if (result.errors.length > 0) {
        // Non-critical parse warnings
        console.warn('CSV parse warnings:', result.errors.filter(e => (e as { type?: string }).type === 'warning'));
      }

      columns = result.meta.fields || [];
      rows = result.data as Record<string, unknown>[];
    }

    // Limit preview rows
    const previewRows = rows.slice(0, 50);

    return NextResponse.json({
      columns,
      totalRows: rows.length,
      previewRows,
      fileName: file.name,
      fileType: isDBF ? 'dbf' : 'csv',
    });
  } catch (error) {
    console.error('Preview error:', error);
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: `Error al procesar el archivo: ${message}` }, { status: 500 });
  }
}
