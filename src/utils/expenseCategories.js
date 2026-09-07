/** Orden fijo de las categorías base (filtros, UI y “restablecer”). */
export const DEFAULT_CATEGORY_ORDER = [
  "Casa",
  "Galileo",
  "Hobbies",
  "Imagen",
  "Otros",
  "Pedidos",
  "Salida",
  "Salud",
  "Servicios",
  "Supermercado",
  "Tarjetas",
  "Transporte"
];

export const DEFAULT_CATEGORIES = DEFAULT_CATEGORY_ORDER;

const CATEGORIES_KEY = "gastos_categories_v1";

const LEGACY_CATEGORY_MAP = {
  Alimentacion: "Pedidos",
  Alimentación: "Pedidos",
  Entretenimiento: "Hobbies",
  Transferencia: "Otros"
};

export function normalizeCategory(cat) {
  if (!cat) return "Otros";
  if (LEGACY_CATEGORY_MAP[cat]) return LEGACY_CATEGORY_MAP[cat];
  if (cat === "Alimentación") return "Pedidos";
  return cat;
}

export function sortCategoriesList(arr) {
  const uniq = [...new Set(arr.map((c) => String(c || "").trim()).filter(Boolean))];
  const orderMap = new Map(DEFAULT_CATEGORY_ORDER.map((c, i) => [c, i]));
  const rootOf = (c) => {
    const s = String(c);
    const i = s.indexOf(" / ");
    return i === -1 ? s : s.slice(0, i);
  };
  const subOf = (c) => {
    const s = String(c);
    const i = s.indexOf(" / ");
    return i === -1 ? "" : s.slice(i + 3);
  };
  return uniq.sort((a, b) => {
    const ra = rootOf(a);
    const rb = rootOf(b);
    const oa = orderMap.has(ra) ? orderMap.get(ra) : 1000;
    const ob = orderMap.has(rb) ? orderMap.get(rb) : 1000;
    if (oa !== ob) return oa - ob;
    if (ra !== rb) return ra.localeCompare(rb, "es");
    return subOf(a).localeCompare(subOf(b), "es");
  });
}

export function safeCategory(cat, availableCategories = DEFAULT_CATEGORIES) {
  if (!cat) return "Otros";
  return availableCategories.includes(cat) ? cat : "Otros";
}

export function normalizeText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Aplana espacios para que "TRANSFERENCIA A TERCEROS" y el "[" puedan estar en líneas distintas en el PDF.
 */
export function transferBracketContents(description) {
  const flat = String(description || "").replace(/\s+/g, " ");
  const re = /transferencia\s+a\s+terceros/gi;
  const contents = [];
  let m;
  while ((m = re.exec(flat)) !== null) {
    const after = flat.slice(m.index + m[0].length);
    const openIdx = after.indexOf("[");
    if (openIdx < 0) continue;
    const afterOpen = after.slice(openIdx + 1);
    const closeIdx = afterOpen.indexOf("]");
    if (closeIdx < 0) continue;
    contents.push(afterOpen.slice(0, closeIdx));
  }
  return contents;
}

export function applyConfiguredCategory(expense, rules, availableCategories = DEFAULT_CATEGORIES) {
  const current = { ...expense, category: safeCategory(normalizeCategory(expense.category), availableCategories) };
  const descriptionNorm = normalizeText(current.description);
  const transferBracketNorms = transferBracketContents(current.description).map((inner) => normalizeText(inner));

  for (const rule of rules.transferRules || []) {
    const matcherNorm = normalizeText(rule.matcher);
    if (!matcherNorm) continue;
    if (transferBracketNorms.some((innerNorm) => innerNorm.includes(matcherNorm))) {
      return { ...current, category: safeCategory(rule.category, availableCategories) };
    }
  }

  for (const rule of rules.keywordRules || []) {
    const keywordNorm = normalizeText(rule.keyword);
    if (!keywordNorm) continue;
    if (descriptionNorm.includes(keywordNorm)) {
      return { ...current, category: safeCategory(rule.category, availableCategories) };
    }
  }

  return current;
}

export function categorize(description) {
  const d = (description || "").toLowerCase();
  if (/farmacia|farmacity|salud|medic|osde/.test(d)) return "Salud";
  if (/super|supermercado|carrefour|coto|jumbo|\bdia\b|hipolito/.test(d)) return "Supermercado";
  if (/sube|transporte|bus|subte|emova|uber|cabify/.test(d)) return "Transporte";
  if (/spotify|netflix|cine|entradas|google|steam|playstation|xbox|despegar/.test(d)) return "Hobbies";
  if (
    /lunch|resto|pedidosya|grido|cafe|food|pasteler|brocoli|vicente lopez|open 25|kiosco/.test(d)
  ) {
    return "Pedidos";
  }
  if (/pelu|barber|cosmeti|farmacity\s+beauty|perfume/.test(d)) return "Imagen";
  if (/teatro|bar|boliche|salida|show/.test(d)) return "Salida";
  if (/tarjeta|resumen|visa|master|creditos de mercado pago|créditos de mercado pago/.test(d)) {
    return "Tarjetas";
  }
  if (/expensa|alquiler|consorcio|inmobiliaria|casa/.test(d)) return "Casa";
  if (/metrogas|edenor|aysa|servicio|debito automatico/.test(d)) return "Servicios";
  if (/galileo/.test(d)) return "Galileo";
  if (/transferencia|terceros|debin/.test(d)) return "Otros";
  return "Otros";
}

export function categorizeMercadoRow(row, description) {
  const sale = String(row.SALE_DETAIL || "")
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .trim();
  if (sale && !/^varios$/i.test(sale)) {
    const fromSale = categorize(sale);
    if (fromSale !== "Otros") return fromSale;
  }
  const pm = String(row.PAYMENT_METHOD_TYPE || "");
  if (pm === "bank_transfer") return "Otros";
  return categorize(description);
}

export function categorizeMercadoNewExport(description, rawType = "") {
  const blob = `${description || ""} ${rawType || ""}`.toLowerCase();
  if (/reserva ·|retiro bolsa|ingreso a mercado pago/.test(blob)) return "Otros";
  if (blob.includes("rendimientos")) return "Otros";
  if (blob.includes("créditos de mercado pago") || blob.includes("creditos de mercado pago")) {
    return "Tarjetas";
  }
  if (blob.includes("pago de servicio")) return "Servicios";
  return categorize(description);
}

export function isMercadoInternalMovement(expense) {
  if (String(expense?.bank || "") !== "Mercado Pago") return false;
  const d = normalizeText(expense.description || "").replace(/\s+/g, " ");
  const medium = normalizeText(expense.card_brand || "");
  if (medium === "bolsa" || medium === "ingreso") return true;
  if (d.startsWith("reserva ·") || d.startsWith("retiro bolsa")) return true;
  if (d.includes("ingreso a mercado pago") || d.includes("ingreso de dinero")) return true;
  if (d.includes("dinero reservado") || d.includes("dinero retirado") || d.includes("reserva por gastos")) {
    return true;
  }
  return false;
}

/** Categoría heurística base (sin reglas del usuario) para reaplicar reglas al vuelo. */
export function baselineCategoryForExpense(e) {
  const desc = e.description || "";
  if (e.bank === "Mercado Pago") {
    if (isMercadoInternalMovement(e)) return "Otros";
    const d = desc.toLowerCase();
    if (d.includes("rendimientos")) return "Otros";
    return categorize(desc);
  }
  return categorize(desc);
}

export function reclassifyExpenseRow(e, kb, rules, availableCategories) {
  if (e.raw_id && kb[e.raw_id]) {
    const entry = kb[e.raw_id];
    return {
      ...e,
      description: entry.name,
      category: safeCategory(normalizeCategory(entry.category), availableCategories),
      is_unknown: false
    };
  }
  const base = baselineCategoryForExpense(e);
  const applied = applyConfiguredCategory({ ...e, category: base }, rules, availableCategories);
  return { ...applied, category: safeCategory(normalizeCategory(applied.category), availableCategories) };
}

export function loadCategories() {
  try {
    const raw = localStorage.getItem(CATEGORIES_KEY);
    if (!raw) return [...DEFAULT_CATEGORY_ORDER];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_CATEGORY_ORDER];
    const cleaned = [...new Set(parsed.map((c) => normalizeCategory(String(c || "").trim())).filter(Boolean))];
    return cleaned.length ? sortCategoriesList(cleaned) : [...DEFAULT_CATEGORY_ORDER];
  } catch {
    return [...DEFAULT_CATEGORY_ORDER];
  }
}

export function saveCategories(categories) {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
}

/**
 * Clave para la torta de gastos: categoría raíz o categoría completa (con subcategoría).
 * Reconoce subcategorías como `Padre / Hijo` o `Padre - Hijo` (guión con espacios).
 * @param {"categories" | "subcategories"} mode
 */
export function chartExpenseCategoryKey(fullCategory, mode) {
  const full = String(fullCategory || "Otros").trim() || "Otros";
  if (mode !== "categories") return full;
  const slash = full.indexOf(" / ");
  if (slash !== -1) return full.slice(0, slash).trim() || full;
  const dashSpaced = full.indexOf(" - ");
  if (dashSpaced !== -1) {
    const root = full.slice(0, dashSpaced).trim();
    return root || full;
  }
  return full;
}

/** Raíces que no entran en gráficos de “ritmo” (día del mes / día de la semana): gastos fijos y liquidación de tarjeta. */
const SPENDING_PATTERN_EXCLUDED_ROOTS = new Set(["Servicios", "Tarjetas", "Tarjeta"]);

export function isExcludedFromSpendingPatternCharts(categoryFull) {
  const root = chartExpenseCategoryKey(categoryFull || "Otros", "categories");
  return SPENDING_PATTERN_EXCLUDED_ROOTS.has(root);
}
