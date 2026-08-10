'use client';

import { useLayoutEffect } from 'react';

// Aplica el tema guardado (paleta + fuente) antes del primer paint.
// useLayoutEffect evita el error de hidratación (a diferencia de aplicar
// estilos al <html> con un script inline antes de que React hidrate).
export function ThemeApplier() {
  useLayoutEffect(() => {
    try {
      const raw = localStorage.getItem('pos-theme');
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        vars?: Record<string, string>;
      };
      if (!saved.vars) return;
      const root = document.documentElement;
      for (const [key, value] of Object.entries(saved.vars)) {
        root.style.setProperty(key, value);
      }
    } catch {
      // Sin tema guardado: se usa el tema por defecto
    }
  }, []);

  return null;
}