import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

interface ImportDepartment {
  name: string;
  description?: string;
}

interface ImportSupplier {
  name: string;
  contact?: string;
  phone?: string;
  email?: string;
  address?: string;
}

interface ImportProduct {
  name: string;
  barcode?: string;
  price: number;
  cost?: number;
  stock?: number;
  minStock?: number;
  departmentName?: string;
  supplierName?: string;
}

interface ImportBody {
  products?: ImportProduct[];
  suppliers?: ImportSupplier[];
  departments?: ImportDepartment[];
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const body: ImportBody = await request.json();
    const { products = [], suppliers = [], departments = [] } = body;

    if (departments.length === 0 && suppliers.length === 0 && products.length === 0) {
      return Response.json(
        { error: "No hay datos para importar. Incluye al menos productos, proveedores o departamentos." },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const departmentMap = new Map<string, number>();
      let departmentsCreated = 0;
      let departmentsSkipped = 0;

      // 1. Process departments
      for (const dept of departments) {
        const name = dept.name.trim();
        if (!name) continue;

        const existing = await tx.department.findFirst({
          where: { name },
        });

        if (existing) {
          departmentMap.set(name, existing.id);
          departmentsSkipped++;
        } else {
          const created = await tx.department.create({
            data: {
              name,
              description: dept.description ?? "",
              active: true,
            },
          });
          departmentMap.set(name, created.id);
          departmentsCreated++;
        }
      }

      const supplierMap = new Map<string, number>();
      let suppliersCreated = 0;
      let suppliersSkipped = 0;

      // 2. Process suppliers
      for (const supp of suppliers) {
        const name = supp.name.trim();
        if (!name) continue;

        const existing = await tx.supplier.findFirst({
          where: { name },
        });

        if (existing) {
          supplierMap.set(name, existing.id);
          suppliersSkipped++;
        } else {
          const created = await tx.supplier.create({
            data: {
              name,
              contact: supp.contact ?? "",
              phone: supp.phone ?? "",
              email: supp.email ?? "",
              address: supp.address ?? "",
              active: true,
            },
          });
          supplierMap.set(name, created.id);
          suppliersCreated++;
        }
      }

      let productsCreated = 0;
      let productsSkipped = 0;
      const productErrors: { name: string; barcode: string; error: string }[] = [];

      // 3. Process products
      for (const prod of products) {
        const name = prod.name.trim();
        if (!name) {
          productErrors.push({
            name: prod.name ?? "(sin nombre)",
            barcode: prod.barcode ?? "",
            error: "Nombre vacío",
          });
          continue;
        }

        const barcode = (prod.barcode ?? "").trim();

        // Resolve department
        let departmentId: number | null = null;
        if (prod.departmentName) {
          const deptId = departmentMap.get(prod.departmentName.trim());
          if (deptId) {
            departmentId = deptId;
          } else {
            // Try to find or create on-the-fly
            const existing = await tx.department.findFirst({
              where: { name: prod.departmentName.trim() },
            });
            if (existing) {
              departmentMap.set(prod.departmentName.trim(), existing.id);
              departmentId = existing.id;
            } else {
              const created = await tx.department.create({
                data: {
                  name: prod.departmentName.trim(),
                  description: "Importado de Aspel SAE",
                  active: true,
                },
              });
              departmentMap.set(prod.departmentName.trim(), created.id);
              departmentId = created.id;
              departmentsCreated++;
            }
          }
        }

        // Resolve supplier
        let supplierId: number | null = null;
        if (prod.supplierName) {
          const suppId = supplierMap.get(prod.supplierName.trim());
          if (suppId) {
            supplierId = suppId;
          } else {
            const existing = await tx.supplier.findFirst({
              where: { name: prod.supplierName.trim() },
            });
            if (existing) {
              supplierMap.set(prod.supplierName.trim(), existing.id);
              supplierId = existing.id;
            } else {
              const created = await tx.supplier.create({
                data: {
                  name: prod.supplierName.trim(),
                  contact: "",
                  phone: "",
                  email: "",
                  address: "",
                  active: true,
                },
              });
              supplierMap.set(prod.supplierName.trim(), created.id);
              supplierId = created.id;
              suppliersCreated++;
            }
          }
        }

        // Check if barcode exists
        if (barcode) {
          const existing = await tx.product.findFirst({
            where: { barcode },
          });
          if (existing) {
            productsSkipped++;
            continue;
          }
        }

        // Create product
        try {
          await tx.product.create({
            data: {
              name,
              barcode,
              price: prod.price ?? 0,
              cost: prod.cost ?? 0,
              stock: prod.stock ?? 0,
              minStock: prod.minStock ?? 5,
              active: true,
              departmentId,
              supplierId,
            },
          });
          productsCreated++;
        } catch (err) {
          const message = err instanceof Error ? err.message : "Error desconocido";
          productErrors.push({ name, barcode, error: message });
        }
      }

      return {
        departments: { created: departmentsCreated, skipped: departmentsSkipped },
        suppliers: { created: suppliersCreated, skipped: suppliersSkipped },
        products: {
          created: productsCreated,
          skipped: productsSkipped,
          errors: productErrors,
        },
      };
    });

    return Response.json({ success: true, counts: result });
  } catch (error) {
    console.error("Error during import:", error);
    return Response.json(
      { error: "Error al importar datos. Revisa el formato del archivo JSON." },
      { status: 500 }
    );
  }
}
