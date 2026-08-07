import { NextRequest, NextResponse } from 'next/server';
import { restoreFullDb } from '@/lib/full-db';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Reemplaza la base de datos local con la copia recibida (dump JSON de /api/sync/full-db).
// Solo se invoca desde la pantalla de sincronizacion con confirmación del usuario.
export async function POST(request: NextRequest) {
  try {
    const dump = await request.json();
    const counts = await restoreFullDb(dump);
    return NextResponse.json({ ok: true, counts });
  } catch (error) {
    console.error('Restore DB error:', error);
    return NextResponse.json(
      { error: `Error al restaurar la base de datos: ${error instanceof Error ? error.message : 'Error desconocido'}` },
      { status: 500 }
    );
  }
}
