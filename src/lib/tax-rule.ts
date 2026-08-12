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
  scope: string;
  scopeValue: number | null;
  status: string;
  nextChange: string | null;
}

export function isTaxActive(rule: { status?: string; active?: boolean; applyTime?: string }, now = new Date()): boolean {
  if (!rule?.active) return false;
  if (rule.status === "forced_on") return true;
  if (rule.status === "forced_off") return false;
  const t = rule.applyTime || "20:00";
  const [h, m] = t.split(":").map((n) => parseInt(n, 10) || 0);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return nowMin >= h * 60 + m;
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
      scope: "ALL",
      scopeValue: null,
      status: "schedule",
      nextChange: null,
    };
  }
  const active = isTaxActive(rule, now);
  let nextChange: string | null = null;
  if (rule.status === "schedule" && rule.active) {
    const [h, m] = rule.applyTime.split(":").map((n) => parseInt(n, 10) || 0);
    const target = new Date(now);
    target.setHours(h, m, 0, 0);
    if (now >= target) target.setDate(target.getDate() + 1);
    nextChange = target.toISOString();
  }
  return {
    configured: true,
    active,
    percentage: rule.percentage,
    applyTime: rule.applyTime,
    scope: rule.scope,
    scopeValue: rule.scopeValue,
    status: rule.status,
    nextChange,
  };
}
