// Permisos por rol. Roles: ADMIN (todo), CASHIER (operación diaria) y
// HELPER (ayudante: mismos permisos que el cajero pero SIN acceso por
// nada al inventario ni al apartado de pedidos).
export type Role = "ADMIN" | "CASHIER" | "HELPER";

export function isAdminRole(role?: string | null): boolean {
  return role === "ADMIN";
}

export function isHelperRole(role?: string | null): boolean {
  return role === "HELPER";
}

// Respuesta estándar cuando el ayudante intenta tocar inventario o pedidos.
export function helperForbidden(entity: "inventario" | "pedidos"): Response {
  return Response.json(
    { error: `El rol Ayudante no tiene acceso a ${entity}` },
    { status: 403 }
  );
}
