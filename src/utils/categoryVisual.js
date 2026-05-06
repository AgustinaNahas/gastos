import { DEFAULT_CATEGORY_ORDER } from "./expenseCategories";

export const CATEGORY_COLORS_KEY = "gastos_category_colors_v1";

export const BUILTIN_CATEGORY_COLOR = Object.fromEntries(DEFAULT_CATEGORY_ORDER.map((name, i) => [name, i]));

export const PALETTE_BG = [
  "#CBD5E0",
  "#FC8181",
  "#F6AD55",
  "#F6E05E",
  "#68D391",
  "#4FD1C5",
  "#63B3ED",
  "#7F9CF5",
  "#B794F4",
  "#F687B3"
];

export const PALETTE_FG = [
  "#1A202C",
  "#1A202C",
  "#1A202C",
  "#1A202C",
  "#1A202C",
  "#1A202C",
  "#1A202C",
  "#1A202C",
  "#1A202C",
  "#1A202C"
];

export const CAT_PALETTE_COUNT = PALETTE_BG.length;

export function parseHexColor(s) {
  if (typeof s !== "string") return null;
  const t = s.trim();
  return /^#[0-9a-fA-F]{6}$/.test(t) ? t : null;
}

export function contrastTextForBg(hex) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#1A202C" : "#ffffff";
}

export function categoryFallbackColorIndex(name) {
  let h = 5381;
  const s = String(name || "");
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return Math.abs(h >>> 0) % CAT_PALETTE_COUNT;
}

export function resolveCategoryVisual(catName, colorsMap) {
  const c = String(catName || "Otros");
  const raw = colorsMap[c];
  const hex = parseHexColor(typeof raw === "string" ? raw : "");
  if (hex) {
    return { bg: hex, fg: contrastTextForBg(hex) };
  }
  const n = Number(raw);
  const idx = Number.isFinite(n) ? Math.abs(Math.floor(n)) % CAT_PALETTE_COUNT : categoryFallbackColorIndex(c);
  return { bg: PALETTE_BG[idx], fg: PALETTE_FG[idx] };
}

export function paletteSwatchIndexForCategory(catName, colorsMap) {
  const raw = colorsMap[String(catName || "Otros")];
  if (parseHexColor(typeof raw === "string" ? raw : "")) return null;
  const n = Number(raw);
  if (Number.isFinite(n)) return Math.abs(Math.floor(n)) % CAT_PALETTE_COUNT;
  return categoryFallbackColorIndex(catName);
}

export function loadCategoryColors() {
  try {
    const raw = localStorage.getItem(CATEGORY_COLORS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const map = typeof parsed === "object" && parsed !== null ? { ...parsed } : {};
    for (const [cat, idx] of Object.entries(BUILTIN_CATEGORY_COLOR)) {
      if (map[cat] === undefined) map[cat] = idx;
    }
    return map;
  } catch {
    return { ...BUILTIN_CATEGORY_COLOR };
  }
}

export function saveCategoryColors(map) {
  localStorage.setItem(CATEGORY_COLORS_KEY, JSON.stringify(map));
}
