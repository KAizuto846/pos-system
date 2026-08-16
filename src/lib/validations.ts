import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().min(1, "Usuario requerido"),
  password: z.string().min(1, "Contraseña requerida"),
});

export const registerSchema = z.object({
  username: z.string().min(3, "Mínimo 3 caracteres").max(50),
  password: z.string().min(6, "Mínimo 6 caracteres").max(100),
  name: z.string().min(1, "Nombre requerido").max(100),
  role: z.enum(["ADMIN", "CASHIER"]).default("CASHIER"),
});

export const userSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(100).optional(),
  name: z.string().min(1).max(100),
  role: z.enum(["ADMIN", "CASHIER"]),
  active: z.boolean().default(true),
});

export const productSchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  barcode: z.string().default(""),
  price: z.number().min(0, "Precio debe ser mayor a 0"),
  cost: z.number().min(0).default(0),
  stock: z.number().int().min(0).default(0),
  minStock: z.number().int().min(0).default(5),
  departmentId: z.number().nullable().optional(),
  supplierId: z.number().nullable().optional(),
  active: z.boolean().default(true),
  piecesPerUnit: z.number().int().positive().nullable().optional(),
  piecesTracked: z.boolean().optional(),
});

export const supplierSchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  contact: z.string().default(""),
  phone: z.string().default(""),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  address: z.string().default(""),
  active: z.boolean().default(true),
});

export const departmentSchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  description: z.string().default(""),
  active: z.boolean().default(true),
});

export const paymentMethodSchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  affectsCash: z.boolean().default(true),
  active: z.boolean().default(true),
});

export const saleSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.number(),
        quantity: z.number().int().min(1),
        price: z.number().min(0),
      })
    )
    .min(1, "Agrega al menos un producto"),
  paymentMethodId: z.number(),
  total: z.number().min(0),
  discountTotal: z.number().min(0).default(0),
  customerId: z.number().nullable().optional(),
  cashReceived: z.number().min(0).nullable().optional(),
  change: z.number().min(0).nullable().optional(),
});

export const orderSchema = z.object({
  supplierId: z.number(),
  notes: z.string().default(""),
  status: z.enum(["pending", "sent", "partial", "received", "cancelled", "on_hold", "ready"]).optional(),
  items: z
    .array(
      z.object({
        // productId es opcional: permite productos que NO existen en inventario
        // (fantasma). En ese caso se guardan name/barcode/price/cost como snapshot.
        productId: z.number().optional(),
        name: z.string().optional(),
        barcode: z.string().optional(),
        price: z.number().optional(),
        cost: z.number().optional(),
        quantity: z.number().int().min(1),
      })
    )
    .min(1),
  // Rango de fechas/horas usado para calcular el pedido. Se guarda por
  // proveedor para que el siguiente pedido continúe donde terminó este.
  range: z
    .object({
      dateFrom: z.string().optional(),
      timeFrom: z.string().optional(),
      dateTo: z.string().optional(),
      timeTo: z.string().optional(),
    })
    .optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type SupplierInput = z.infer<typeof supplierSchema>;
export type DepartmentInput = z.infer<typeof departmentSchema>;
export type PaymentMethodInput = z.infer<typeof paymentMethodSchema>;
export type SaleInput = z.infer<typeof saleSchema>;
export const refundSchema = z.object({
  saleId: z.number(),
  productId: z.number(),
  quantity: z.number().int().min(1, "Cantidad debe ser al menos 1"),
  amount: z.number().min(0, "Monto debe ser mayor o igual a 0"),
  reason: z.string().default(""),
});

export type RefundInput = z.infer<typeof refundSchema>;
export type OrderInput = z.infer<typeof orderSchema>;
