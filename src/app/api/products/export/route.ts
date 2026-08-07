// GET /api/products/export - Export products as JSON or CSV with filters applied
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "json";
    const q = searchParams.get("q");
    const departmentId = searchParams.get("departmentId");
    const supplierId = searchParams.get("supplierId");
    const priceMin = searchParams.get("priceMin");
    const priceMax = searchParams.get("priceMax");
    const costMin = searchParams.get("costMin");
    const costMax = searchParams.get("costMax");
    const stockMin = searchParams.get("stockMin");
    const stockMax = searchParams.get("stockMax");
    const minStockMin = searchParams.get("minStockMin");
    const minStockMax = searchParams.get("minStockMax");
    const active = searchParams.get("active");

    const where: Prisma.ProductWhereInput = {};

    if (q) {
      where.OR = [
        { barcode: { contains: q } },
        { name: { contains: q } },
      ];
    }

    if (departmentId) where.departmentId = parseInt(departmentId);
    if (supplierId) where.supplierId = parseInt(supplierId);

    if (priceMin || priceMax) {
      where.price = {};
      if (priceMin) where.price.gte = parseFloat(priceMin);
      if (priceMax) where.price.lte = parseFloat(priceMax);
    }
    if (costMin || costMax) {
      where.cost = {};
      if (costMin) where.cost.gte = parseFloat(costMin);
      if (costMax) where.cost.lte = parseFloat(costMax);
    }
    if (stockMin || stockMax) {
      where.stock = {};
      if (stockMin) where.stock.gte = parseInt(stockMin);
      if (stockMax) where.stock.lte = parseInt(stockMax);
    }
    if (minStockMin || minStockMax) {
      where.minStock = {};
      if (minStockMin) where.minStock.gte = parseInt(minStockMin);
      if (minStockMax) where.minStock.lte = parseInt(minStockMax);
    }
    if (active === "true") where.active = true;
    if (active === "false") where.active = false;

    const products = await prisma.product.findMany({
      where,
      include: {
        department: { select: { name: true } },
        supplier: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    });

    if (format === "csv") {
      const escapeCsv = (value: string | number | boolean | null | undefined): string => {
        const str = String(value ?? "");
        if (/[",\n]/.test(str)) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const header = [
        "id", "nombre", "codigo_barras", "precio_venta", "costo",
        "stock", "stock_minimo", "activo", "departamento", "proveedor",
      ];
      const rows = products.map((p) => [
        p.id,
        escapeCsv(p.name),
        escapeCsv(p.barcode),
        p.price,
        p.cost,
        p.stock,
        p.minStock,
        p.active ? "si" : "no",
        escapeCsv(p.department?.name || ""),
        escapeCsv(p.supplier?.name || ""),
      ].join(","));

      const csv = "\uFEFF" + [header.join(","), ...rows].join("\n");

      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=inventario-${new Date().toISOString().split("T")[0]}.csv`,
        },
      });
    }

    const exportData = {
      exportVersion: "1.0",
      exportedAt: new Date().toISOString(),
      exportedBy: (session.user as { username?: string }).username || "admin",
      total: products.length,
      products: products.map((p) => ({
        name: p.name,
        barcode: p.barcode,
        price: p.price,
        cost: p.cost,
        stock: p.stock,
        minStock: p.minStock,
        active: p.active,
        department: p.department?.name || null,
        supplier: p.supplier?.name || null,
      })),
    };

    return new Response(JSON.stringify(exportData, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename=inventario-${new Date().toISOString().split("T")[0]}.json`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
