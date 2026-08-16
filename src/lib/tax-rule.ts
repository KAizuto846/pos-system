// Impuesto / recargo por horario
//
// Regla unica: un aumento porcentual que se cobra cuando la hora actual es
// >= applyTime ("HH:MM"). El precio publico SIEMPRE se redondea hacia arriba
// (Math.ceil) al entero mas cercano. El precio base del producto no cambia.
//
// status de la regla:
//   "schedule"   -> activa segun el horario
//   "forced_on"  -> activa manualmente (boton "Aplicar ahora")
//   "forced_off" -> desactivada manualmente (boton "Revertir")
//
// Se usa en el servidor (POST /api/sales, /api/tax/*) y como referencia en el
// cliente del POS (GET /api/tax/status devuelve "active").

import { prisma } from "@/lib/prisma";
import type { TaxRule } from "@prisma/client";

export interface TaxRuleData {
  id: number;
  name: string;
  percentage: number;
  applyTime: string;
  endTime: string;
  scope: string;
  scopeValue: number | null;
  active: boolean;
  status: string;
}

export function toRuleData(row: TaxRule | null): TaxRuleData | null {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    percentage: row.percentage,
    applyTime: row.applyTime,
    endTime: row.endTime || "",
    scope: row.scope,
    scopeValue: row.scopeValue,
    active: row.active,
    status: row.status,
  };
}

export interface TaxState {
  configured: boolean;
  active: boolean;
  percentage: number;
  applyTime: string;
  endTime: string;
  scope: string;
  scopeValue: number | null;
  status: string;
  nextChange: string | null;
}

// Convierte "HH:MM" a minutos del día. Devuelve -1 si es inválido.
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map((n) => parseInt(n, 10) || 0);
  return h * 60 + m;
}

// El impuesto aplica dentro de la ventana [applyTime, endTime) (en minutos).
// Si endTime está vacío, aplica desde applyTime en adelante. Soporta ventanas
// que cruzan la medianoche (ej. 20:00 → 06:00).
export function isTaxActive(
  rule: { status?: string; active?: boolean; applyTime?: string; endTime?: string },
  now = new Date()
): boolean {
  if (!rule?.active) return false;
  if (rule.status === "forced_on") return true;
  if (rule.status === "forced_off") return false;

  const start = timeToMinutes(rule.applyTime || "20:00");
  const endRaw = rule.endTime || "";
  const end = endRaw ? timeToMinutes(endRaw) : -1;
  const nowMin = now.getHours() * 60 + now.getMinutes();

  if (end < 0) {
    // Sin hora de fin: aplica desde start en adelante
    return nowMin >= start;
  }
  if (end > start) {
    // Ventana normal dentro del día: start <= now < end
    return nowMin >= start && nowMin < end;
  }
  // Cruza medianoche: [start, 1440) ∪ [0, end)
  return nowMin >= start || nowMin < end;
}

export function applyTaxToPrice(rule: { active: boolean; percentage: number }, base: number): number {
  if (!rule?.active || !rule.percentage || base <= 0) return base;
  return Math.ceil(base * (1 + rule.percentage / 100));
}

export interface TaxMatchInput {
  supplierId: number | null;
  departmentId: number | null;
  price: number;
}

export function taxMatchesScope(rule: { scope: string; scopeValue: number | null }, product: TaxMatchInput): boolean {
  switch (rule.scope) {
    case "SUPPLIER":
      return product.supplierId != null && product.supplierId === rule.scopeValue;
    case "DEPARTMENT":
      return product.departmentId != null && product.departmentId === rule.scopeValue;
    case "MIN_PRICE":
      return product.price >= (rule.scopeValue ?? 0);
    case "ALL":
    default:
      return true;
  }
}

let ruleCache: { at: number; data: TaxRuleData | null } | null = null;

export async function getTaxRule(): Promise<TaxRuleData | null> {
  const now = Date.now();
  if (ruleCache && now - ruleCache.at < 2000) return ruleCache.data;
  const row = await prisma.taxRule.findFirst();
  const data = toRuleData(row);
  ruleCache = { at: now, data };
  return data;
}

export function invalidateTaxRuleCache() {
  ruleCache = null;
}

export function computeTaxState(rule: TaxRuleData | null, now = new Date()): TaxState {
  if (!rule) {
    return {
      configured: false,
      active: false,
      percentage: 0,
      applyTime: "20:00",
      endTime: "",
      scope: "ALL",
      scopeValue: null,
      status: "schedule",
      nextChange: null,
    };
  }
  const active = isTaxActive(rule, now);
  let nextChange: string | null = null;
  if (rule.status === "schedule" && rule.active) {
    const start = timeToMinutes(rule.applyTime || "20:00");
    const end = rule.endTime ? timeToMinutes(rule.endTime) : -1;
    const nowMin = now.getHours() * 60 + now.getMinutes();

    // Buscar la próxima transición (inicio o fin) más cercana.
    let nextMin = -1;
    if (end < 0) {
      // Sin fin: próxima transición es el próximo inicio (si aún no empezó hoy,
      // hoy; si ya empezó, mañana)
      const nextStart = nowMin < start ? start : start + 24 * 60;
      nextMin = nextStart;
    } else if (end > start) {
      // Ventana normal: transición a fin o a inicio, lo que venga primero
      if (nowMin < start) nextMin = start;
      else if (nowMin < end) nextMin = end;
      else nextMin = start + 24 * 60;
    } else {
      // Cruza medianoche: activo si nowMin >= start o nowMin < end
      if (nowMin < end) {
        nextMin = end; // dentro del tramo [0, end): fin a las end
      } else if (nowMin >= start) {
        nextMin = start + 24 * 60; // dentro de [start, 1440): fin mañana a las end
      } else {
        nextMin = start; // entre end y start: próximo inicio hoy
      }
    }

    const target = new Date(now);
    const dayOffset = Math.floor(nextMin / (24 * 60));
    const minutesOfDay = nextMin % (24 * 60);
    target.setDate(target.getDate() + dayOffset);
    target.setHours(Math.floor(minutesOfDay / 60), minutesOfDay % 60, 0, 0);
    nextChange = target.toISOString();
  }
  return {
    configured: true,
    active,
    percentage: rule.percentage,
    applyTime: rule.applyTime,
    endTime: rule.endTime,
    scope: rule.scope,
    scopeValue: rule.scopeValue,
    status: rule.status,
    nextChange,
  };
}
