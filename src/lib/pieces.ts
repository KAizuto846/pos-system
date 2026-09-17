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

// Cliente mínimo necesario para las operaciones de piezas (sirve tanto un
// Prisma.TransactionClient como el propio PrismaClient).
interface PieceDbClient {
  product: {
    findFirst(args: { where: { pieceOfProductId?: number; barcode?: string } }): Promise<unknown | null>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: number; name: string; barcode: string }>;
  };
}

export async function nextAvailablePieceBarcode(
  tx: PieceDbClient,
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

// Crea (una sola vez) el producto pieza "Pieza de ..." de una caja CT/(N).
// La pieza nace con piecesPerUnit = N: aunque la información de la caja cambie
// (renombre, precio, costo, stock...), la pieza siempre recuerda de cuántas
// piezas era la caja de la que proviene y a qué caja pertenece
// (pieceOfProductId nunca se rompe). Devuelve null si ya existía.
export async function ensurePieceForBox(
  tx: PieceDbClient,
  box: {
    id: number;
    name: string;
    barcode: string;
    price: number;
    cost: number;
    departmentId: number | null;
    supplierId: number | null;
    productLines?: Array<{ supplierId: number; supplierPrice: number | null; isPrimary: boolean }>;
  },
  pieces: number
) {
  if (!(pieces > 0)) return null;

  const existing = await tx.product.findFirst({
    where: { pieceOfProductId: box.id },
  });
  if (existing) return null;

  const barcode = await nextAvailablePieceBarcode(tx, pieceBarcode(box.barcode));
  const lines =
    box.productLines?.map((line) => ({
      supplierId: line.supplierId,
      supplierPrice: line.supplierPrice,
      isPrimary: line.isPrimary,
    })) ?? [];

  const piece = await tx.product.create({
    data: {
      name: pieceDisplayName(box.name),
      barcode,
      price: box.price,
      // El costo de la pieza se deriva automáticamente de la caja:
      // costo de la caja ÷ piezas por caja.
      cost: box.cost / pieces,
      stock: 0,
      minStock: 1,
      active: true,
      departmentId: box.departmentId,
      supplierId: box.supplierId,
      // La pieza "nace" sabiendo que su caja trae N piezas: aunque la caja
      // cambie después, la pieza conserva este N.
      piecesPerUnit: pieces,
      pieceOfProductId: box.id,
      productLines: { create: lines },
    },
  });
  return piece;
}