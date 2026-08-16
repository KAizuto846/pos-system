import type { Prisma } from "@prisma/client";

export interface PiecesDetected {
  pieces: number;
  baseName: string;
}

const BOX_PATTERN = /CT\/\((\d+)\)\s*$/i;
const BOX_PATTERN_FLAT = /CT\/(\d+)\s*$/i;

export function detectPiecesFromName(name: string): PiecesDetected | null {
  const trimmed = (name || "").trim();
  const match = trimmed.match(BOX_PATTERN) ?? trimmed.match(BOX_PATTERN_FLAT);
  if (!match) return null;
  const pieces = Number.parseInt(match[1], 10);
  if (!(pieces > 0 && pieces <= 9999)) return null;
  const index = match.index ?? 0;
  const baseName = trimmed.slice(0, index).trim();
  if (!baseName) return null;
  return { pieces, baseName };
}

export function pieceDisplayName(productName: string): string {
  const detected = detectPiecesFromName(productName);
  return `Pieza de ${detected ? detected.baseName : productName}`;
}

export function pieceBarcode(boxBarcode: string): string {
  return `S${boxBarcode}`;
}

export async function nextAvailablePieceBarcode(
  tx: Prisma.TransactionClient,
  base: string
): Promise<string> {
  let candidate = base;
  let suffix = 2;
  for (;;) {
    const found = await tx.product.findFirst({ where: { barcode: candidate } });
    if (!found) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

export interface PieceBoxState {
  product: {
    id: number;
    name: string;
    barcode: string;
    stock: number;
    price: number;
    cost: number;
    minStock: number;
    active: boolean;
    piecesPerUnit: number | null;
    piecesTracked: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
  piece: {
    id: number;
    name: string;
    barcode: string;
    stock: number;
    price: number;
    cost: number;
    active: boolean;
  } | null;
  openedBoxes: number;
}