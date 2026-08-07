import { NextRequest, NextResponse } from 'next/server';
import { restoreFullDb } from '@/lib/full-db';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Modo web (sin Electron): copia la base de datos completa del equipo indicado
// hacia este servidor. En escritorio lo hace Electron vía IPC.
export async function POST(request: NextRequest) {
  try {
    const { peerUrl } = await request.json();
    if (!peerUrl || typeof peerUrl !== 'string') {
      return NextResponse.json({ error: 'Falta la URL del equipo' }, { status: 400 });
    }
    const url = peerUrl.includes('://') ? peerUrl : `http://${peerUrl}`;

    const res = await fetch(`${url}/api/sync/full-db`, { signal: AbortSignal.timeout(300000) });
    if (!res.ok) {
      return NextResponse.json(
        { error: `El equipo respondió con estado ${res.status}` },
        { status: 502 }
      );
    }
    const dump = await res.json();
    if (!dump?.data) {
      return NextResponse.json({ error: 'El equipo no devolvió datos válidos' }, { status: 502 });
    }

    const counts = await restoreFullDb(dump);
    return NextResponse.json({ ok: true, counts });
  } catch (error) {
    console.error('Full DB copy error:', error);
    return NextResponse.json(
      { error: `Error al copiar la base de datos: ${error instanceof Error ? error.message : 'Error desconocido'}` },
      { status: 500 }
    );
  }
}
