import { NextResponse } from 'next/server';
import { dumpFullDb } from '@/lib/full-db';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Exporta la base de datos completa (todas las tablas de negocio) como JSON.
// La usan otros equipos en la red local para copiar la BD (estilo rclone).
export async function GET() {
  try {
    const dump = await dumpFullDb();
    return NextResponse.json(dump);
  } catch (error) {
    console.error('Full DB export error:', error);
    return NextResponse.json(
      { error: `Error al exportar la base de datos: ${error instanceof Error ? error.message : 'Error desconocido'}` },
      { status: 500 }
    );
  }
}
