// POST /api/products/import-file - Import from a server-side file path or uploaded Excel/CSV
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { detectPiecesFromName, ensurePieceForBox } from "@/lib/pieces";
import * as fs from "fs";
import * as path from "path";

export const maxDuration = 120;
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const contentType = request.headers.get("content-type") || "";
    let data: any;

    if (contentType.includes("multipart/form-data")) {
      // File upload (Excel/CSV/JSON)
      const formData = await request.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return Response.json({ error: "No se envio ningun archivo" }, { status: 400 });
      }

      const fileName = file.name.toLowerCase();
      const buffer = Buffer.from(await file.arrayBuffer());

      if (fileName.endsWith(".json")) {
        data = JSON.parse(buffer.toString("utf-8"));
      } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        data = { products: XLSX.utils.sheet_to_json(sheet) };
      } else {
        return Response.json({ error: "Formato no soportado. Usa JSON, XLSX o XLS" }, { status: 400 });
      }
    } else {
      // JSON body with filePath or products array
      data = await request.json();
    }

    // Handle both formats: direct products array or { products: [...] } wrapper
    const products = Array.isArray(data) ? data : (data.products || []);

    if (products.length === 0) {
      return Response.json({ error: "No se encontraron productos en el archivo" }, { status: 400 });
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of products) {
      try {
        const name = (row.name || row.Descripcion || row["Descripción"] || "").toString().trim();
        if (!name) {
          skipped++;
          continue;
        }

        const barcode = (row.barcode || row.Clave || row.CLAVE || row.codigo || "").toString().trim().replace(/[^\x20-\x7E]/g, "");
        const price = parseFloat(String(row.price ?? row["Precio público"] ?? row["Precio publico"] ?? row.precio ?? 0)) || 0;
        const cost = parseFloat(String(row.cost ?? row.costo ?? 0)) || 0;
        const stock = parseInt(String(row.stock ?? row.Existencias ?? row.existencias ?? 0), 10) || 0;
        const minStock = parseInt(String(row.minStock ?? row.min_stock ?? 5), 10) || 5;
        const deptName = (row.department || row.Departamento || row.Linea || row["Línea"] || "").toString().trim();
        const suppName = (row.supplier || row.Proveedor || row.proveedor || "").toString().trim();

        let departmentId: number | null = null;
        if (deptName) {
          let dept = await prisma.department.findFirst({ where: { name: deptName } });
          if (!dept) {
            dept = await prisma.department.create({ data: { name: deptName, description: "Importado" } });
          }
          departmentId = dept.id;
        }

        let supplierId: number | null = null;
        if (suppName) {
          let supp = await prisma.supplier.findFirst({ where: { name: suppName } });
          if (!supp) {
            supp = await prisma.supplier.create({ data: { name: suppName } });
          }
          supplierId = supp.id;
        }

        const existing = barcode
          ? await prisma.product.findFirst({ where: { barcode } })
          : null;

        if (existing) {
          const detectedUpdate = detectPiecesFromName(name);
          await prisma.product.update({
            where: { id: existing.id },
            data: {
              name, barcode: barcode || existing.barcode, price, cost, stock, minStock, departmentId, supplierId,
              // Caja CT/(N): se marca con su N para que lo recuerde siempre
              ...(detectedUpdate ? { piecesPerUnit: detectedUpdate.pieces, piecesTracked: true } : {}),
            },
          });

          // Caja sin producto pieza: crearlo (una sola vez)
          if (detectedUpdate) {
            const box = await prisma.product.findUnique({
              where: { id: existing.id },
              select: { id: true, name: true, barcode: true, price: true, cost: true, departmentId: true, supplierId: true },
            });
            if (box) await ensurePieceForBox(prisma, box, detectedUpdate.pieces);
          }

          // Sincronizar productLines: el proveedor importado queda como línea primaria
          if (supplierId) {
            await prisma.$transaction([
              prisma.productLine.updateMany({
                where: { productId: existing.id, isPrimary: true },
                data: { isPrimary: false },
              }),
              prisma.productLine.upsert({
                where: {
                  productId_supplierId: { productId: existing.id, supplierId },
                },
                create: { productId: existing.id, supplierId, isPrimary: true },
                update: { isPrimary: true },
              }),
            ]);
          }
          updated++;
        } else {
          const detectedCreate = detectPiecesFromName(name);
          const created = await prisma.product.create({
            data: {
              name, barcode, price, cost, stock, minStock, departmentId, supplierId,
              ...(detectedCreate ? { piecesPerUnit: detectedCreate.pieces, piecesTracked: true } : {}),
            },
          });

          // Caja CT/(N): crear su producto pieza
          if (detectedCreate) {
            await ensurePieceForBox(prisma, {
              id: created.id,
              name: created.name,
              barcode: created.barcode,
              price: created.price,
              cost: created.cost,
              departmentId: created.departmentId,
              supplierId: created.supplierId,
            }, detectedCreate.pieces);
          }

          // Crear la productLine primaria para que el proveedor se muestre en inventario
          if (supplierId) {
            await prisma.productLine.create({
              data: { productId: created.id, supplierId, isPrimary: true },
            });
          }
          imported++;
        }
      } catch (err: any) {
        errors.push(err.message);
        skipped++;
      }
    }

    return Response.json({
      success: true,
      imported,
      updated,
      skipped,
      total: products.length,
      errors: errors.length > 0 ? errors.slice(0, 10) : [],
    });
  } catch (error: any) {
    console.error("Import file error:", error);
    return Response.json(
      { error: error.message || "Error al importar archivo" },
      { status: 500 }
    );
  }
}
