// Paletas de color y fuentes configurables del negocio.
// Las variables se sobreescriben en <html> en tiempo de ejecución:
// Tailwind v4 compila utilidades como var(--color-primary), así que
// cambiar estos valores cambia botones, badges, rings y acentos en vivo.

export interface PaletteDef {
  id: string;
  name: string;
  swatch: string;
  vars: Record<string, string>;
}

export const PALETTES: PaletteDef[] = [
  {
    id: "emerald",
    name: "Esmeralda",
    swatch: "#059669",
    vars: {
      "--color-primary": "#059669",
      "--color-ring": "#059669",
      "--color-accent": "#059669",
    },
  },
  {
    id: "azul",
    name: "Azul",
    swatch: "#2563eb",
    vars: {
      "--color-primary": "#2563eb",
      "--color-ring": "#2563eb",
      "--color-accent": "#3b82f6",
    },
  },
  {
    id: "violeta",
    name: "Violeta",
    swatch: "#7c3aed",
    vars: {
      "--color-primary": "#7c3aed",
      "--color-ring": "#7c3aed",
      "--color-accent": "#8b5cf6",
    },
  },
  {
    id: "rosa",
    name: "Rosa",
    swatch: "#db2777",
    vars: {
      "--color-primary": "#db2777",
      "--color-ring": "#db2777",
      "--color-accent": "#ec4899",
    },
  },
  {
    id: "naranja",
    name: "Naranja",
    swatch: "#ea580c",
    vars: {
      "--color-primary": "#ea580c",
      "--color-ring": "#ea580c",
      "--color-accent": "#f97316",
    },
  },
  {
    id: "teal",
    name: "Turquesa",
    swatch: "#0d9488",
    vars: {
      "--color-primary": "#0d9488",
      "--color-ring": "#0d9488",
      "--color-accent": "#14b8a6",
    },
  },
  {
    id: "rojo",
    name: "Rojo",
    swatch: "#b91c1c",
    vars: {
      "--color-primary": "#b91c1c",
      "--color-ring": "#b91c1c",
      "--color-accent": "#ef4444",
    },
  },
];

export interface FontDef {
  id: string;
  name: string;
  stack: string;
}

// Fuentes del sistema (sin descargas externas): funcionan offline y
// traen soporte completo de acentos y la ñ.
export const APP_FONTS: FontDef[] = [
  {
    id: "sistema",
    name: "Sistema (predeterminada)",
    stack: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  {
    id: "moderna",
    name: "Moderna",
    stack: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  },
  {
    id: "verdana",
    name: "Verdana",
    stack: "Verdana, Geneva, Tahoma, sans-serif",
  },
  {
    id: "trebuchet",
    name: "Trebuchet",
    stack: "'Trebuchet MS', 'Lucida Grande', 'Lucida Sans Unicode', sans-serif",
  },
  {
    id: "clasica",
    name: "Clásica (serif)",
    stack: "Georgia, 'Times New Roman', Times, serif",
  },
  {
    id: "consola",
    name: "Consola",
    stack: "'Consolas', 'Courier New', monospace",
  },
];

export const THEME_STORAGE_KEY = "pos-theme";

export interface SavedTheme {
  paletteId: string;
  fontId: string;
  vars: Record<string, string>;
  font: string;
}

export function getSavedTheme(): SavedTheme | null {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedTheme;
    if (!parsed.vars || typeof parsed.font !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function applyTheme(paletteId: string, fontId: string) {
  const palette = PALETTES.find((p) => p.id === paletteId) ?? PALETTES[0];
  const font = APP_FONTS.find((f) => f.id === fontId) ?? APP_FONTS[0];
  const vars: Record<string, string> = { ...palette.vars, "--app-font": font.stack };

  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
  try {
    localStorage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({ paletteId, fontId, vars, font: font.stack } satisfies SavedTheme)
    );
  } catch {
    // localStorage no disponible: el tema aplica solo para esta sesión
  }
}