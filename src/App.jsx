import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  addExpenseIfNew,
  buildStoredExpense,
  clearAllExpenses,
  deleteExpensesByIds,
  loadAllExpenses,
  putExpense
} from "./db/expensesDb";

const STORAGE_KEY = "gastos_kb_v2";
const COLUMN_PREFS_KEY = "gastos_visible_columns_v1";
const AUTO_RULES_KEY = "gastos_auto_category_rules_v1";
const CATEGORIES_KEY = "gastos_categories_v1";
const CATEGORY_COLORS_KEY = "gastos_category_colors_v1";
const USE_DESCRIPTION_AS_CATEGORY = "__USE_DESCRIPTION_AS_CATEGORY__";
GlobalWorkerOptions.workerSrc = pdfWorker;

/** Orden fijo de las categorías base (filtros, UI y “restablecer”). */
const DEFAULT_CATEGORY_ORDER = [
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

const DEFAULT_CATEGORIES = DEFAULT_CATEGORY_ORDER;

const BUILTIN_CATEGORY_COLOR = Object.fromEntries(DEFAULT_CATEGORY_ORDER.map((name, i) => [name, i]));

const PALETTE_BG = [
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

const PALETTE_FG = [
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

const CAT_PALETTE_COUNT = PALETTE_BG.length;

const LEGACY_CATEGORY_MAP = {
  Alimentacion: "Pedidos",
  Alimentación: "Pedidos",
  Entretenimiento: "Hobbies",
  Transferencia: "Otros"
};

function normalizeCategory(cat) {
  if (!cat) return "Otros";
  if (LEGACY_CATEGORY_MAP[cat]) return LEGACY_CATEGORY_MAP[cat];
  if (cat === "Alimentación") return "Pedidos";
  return cat;
}

function sortCategoriesList(arr) {
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

function parseHexColor(s) {
  if (typeof s !== "string") return null;
  const t = s.trim();
  return /^#[0-9a-fA-F]{6}$/.test(t) ? t : null;
}

function contrastTextForBg(hex) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#1A202C" : "#ffffff";
}

function resolveCategoryVisual(catName, colorsMap) {
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

function paletteSwatchIndexForCategory(catName, colorsMap) {
  const raw = colorsMap[String(catName || "Otros")];
  if (parseHexColor(typeof raw === "string" ? raw : "")) return null;
  const n = Number(raw);
  if (Number.isFinite(n)) return Math.abs(Math.floor(n)) % CAT_PALETTE_COUNT;
  return categoryFallbackColorIndex(catName);
}

function loadKB() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveKB(kb) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(kb));
}

const COLUMN_DEFS = [
  { id: "date", label: "Fecha" },
  { id: "description", label: "Descripcion" },
  { id: "category", label: "Categoria" },
  { id: "bank", label: "Banco" },
  { id: "medium", label: "Medio" },
  { id: "type", label: "Tipo" },
  { id: "source", label: "Origen" },
  { id: "amount", label: "Monto" }
];

const DEFAULT_VISIBLE_COLUMNS = {
  date: true,
  description: true,
  category: true,
  bank: true,
  medium: true,
  type: true,
  source: false,
  amount: true
};

const DEFAULT_AUTO_RULES = {
  keywordRules: [],
  transferRules: []
};

function cloneRules(r) {
  return {
    keywordRules: (r.keywordRules || []).map((x) => ({ ...x })),
    transferRules: (r.transferRules || []).map((x) => ({ ...x }))
  };
}

function safeCategory(cat, availableCategories = DEFAULT_CATEGORIES) {
  if (!cat) return "Otros";
  return availableCategories.includes(cat) ? cat : "Otros";
}

function normalizeText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Movimientos entre cuentas propias (filtro opcional). */
function isInterAccountMovement(expense) {
  const d = normalizeText(expense.description || "").replace(/\s+/g, " ");
  if (!d) return false;
  if (d.includes("debito debin recurrente") ||
    d.includes("transf. ctas propias") ||
    d.includes("transf ctas propias") ||
    d.includes("transf.ctas propias") ||
    d.includes("transferencia entre cuentas") ||
    d.includes("transferencia enviada maria agustina,nahas") ||
    d.includes("su pago en pesos") ||
    d.includes("rescate fima")) return true;
  return false;
}

/** Une palabras partidas por guión/salto (típico en PDFs) para matchear descripciones de pago de tarjeta. */
function flattenDescriptionForMatching(description) {
  return String(description || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\r?\n/g, " ")
    .replace(/-\s+/g, "")
    .replace(/\s*-\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Débito por pago / liquidación del resumen de tarjeta (no es una compra). Excluido en gráficos por defecto. */
function isCardBillPayment(expense) {
  const s = flattenDescriptionForMatching(expense.description);
  if (!s.includes("pago")) return false;
  if (/\bpago\s+tarjeta\s+master\b/.test(s)) return true;
  if (
    /\bpago\s+tarjeta\s+visa\b/.test(s) &&
    (/\bal\s+vto\b/.test(s) || /\bvto\b/.test(s) || /d\.?\s*a\.?\s*al/.test(s) || /electron/.test(s))
  ) {
    return true;
  }
  if (/\bpago\s+visa(\s+electronico|\s+elec\s*tron)/.test(s)) return true;
  if (/\bpago\s+master\s*card(\s+electronico|\s+elec\s*tron|\s+electroni\s+co\b)/.test(s)) return true;
  if (/\bpago\s+mastercard(\s+electronico|\s+elec\s*tron)/.test(s)) return true;
  return false;
}

function loadVisibleColumns() {
  try {
    const raw = localStorage.getItem(COLUMN_PREFS_KEY);
    if (!raw) return { ...DEFAULT_VISIBLE_COLUMNS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_VISIBLE_COLUMNS, ...parsed };
  } catch {
    return { ...DEFAULT_VISIBLE_COLUMNS };
  }
}

function saveVisibleColumns(cols) {
  localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(cols));
}

function loadAutoCategoryRules() {
  try {
    const raw = localStorage.getItem(AUTO_RULES_KEY);
    if (!raw) return { ...DEFAULT_AUTO_RULES };
    const parsed = JSON.parse(raw);
    return {
      keywordRules: Array.isArray(parsed.keywordRules) ? parsed.keywordRules : [],
      transferRules: Array.isArray(parsed.transferRules) ? parsed.transferRules : []
    };
  } catch {
    return { ...DEFAULT_AUTO_RULES };
  }
}

function saveAutoCategoryRules(rules) {
  localStorage.setItem(AUTO_RULES_KEY, JSON.stringify(rules));
}

function loadCategories() {
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

function saveCategories(categories) {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
}

function categoryFallbackColorIndex(name) {
  let h = 5381;
  const s = String(name || "");
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return Math.abs(h >>> 0) % CAT_PALETTE_COUNT;
}

function loadCategoryColors() {
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

function saveCategoryColors(map) {
  localStorage.setItem(CATEGORY_COLORS_KEY, JSON.stringify(map));
}

/**
 * Aplana espacios para que "TRANSFERENCIA A TERCEROS" y el "[" puedan estar en líneas distintas en el PDF.
 * Busca: TRANSFERENCIA A TERCEROS + (cualquier texto) + [ ... contenido ... ] + (cualquier cosa después del ])
 */
function transferBracketContents(description) {
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

function applyConfiguredCategory(expense, rules, availableCategories = DEFAULT_CATEGORIES) {
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

function parseMoney(value) {
  if (!value) return 0;
  const cleaned = String(value).replace(/\$/g, "").replace(/\./g, "").replace(",", ".").replace(/\s+/g, "").trim();
  if (!cleaned) return 0;
  const negative = cleaned.startsWith("-") || cleaned.endsWith("-");
  const numeric = parseFloat(cleaned.replace(/-/g, ""));
  if (Number.isNaN(numeric)) return 0;
  return negative ? -numeric : numeric;
}

function normalizeDate(dateText) {
  if (!dateText) return "";
  if (dateText.includes(".")) {
    const [dd, mm, yy] = dateText.split(".");
    return `${dd}/${mm}/${yy.length === 2 ? `20${yy}` : yy}`;
  }
  return dateText;
}

function detectStatementType(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.includes("patagonia-debito")) return "patagonia-debito";
  if (lower.includes("patagonia-credito-visa")) return "patagonia-credito-visa";
  if (lower.includes("patagonia-credito-master")) return "patagonia-credito-master";
  if (lower.includes("galicia-debito")) return "galicia-debito";
  if (lower.includes("galicia-credito-visa")) return "galicia-credito-visa";
  if (lower.includes("galicia-credito-master")) return "galicia-credito-master";
  if (lower.includes("mercado-debito") || lower.includes("mercadopago")) return "mercado-debito";
  return "unknown";
}

function looksLikeMercadoPagoCsv(text) {
  const head = String(text).slice(0, 2500);
  if (head.includes("SOURCE_ID") && head.includes("TRANSACTION_DATE") && head.includes("REAL_AMOUNT")) return true;
  if (head.includes("RELEASE_DATE") && head.includes("TRANSACTION_NET_AMOUNT") && head.includes("REFERENCE_ID")) return true;
  return false;
}

function deriveMonthKey(dateStr) {
  if (!dateStr) return "";
  const iso = String(dateStr).match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const slash = String(dateStr).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) return `${slash[3]}-${slash[2].padStart(2, "0")}`;
  return "";
}

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function dateStringToLocalDate(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr);
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) {
    const d = new Date(Number(slash[3]), Number(slash[2]) - 1, Number(slash[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (s.includes("T")) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function parseDateForSort(dateStr) {
  const d = dateStringToLocalDate(dateStr);
  return d ? d.getTime() : 0;
}

function expenseDayKey(dateStr) {
  const d = dateStringToLocalDate(dateStr);
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function pieSlicePath(cx, cy, r, a0, a1) {
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
}

function buildPieSlices(entries) {
  const total = entries.reduce((s, e) => s + e.value, 0);
  if (total <= 0) return [];
  let angle = -Math.PI / 2;
  return entries.map((e) => {
    const frac = e.value / total;
    const a0 = angle;
    const a1 = angle + frac * 2 * Math.PI;
    angle = a1;
    return { ...e, pct: frac * 100, a0, a1 };
  });
}

/** Muestra la fecha guardada más el día de la semana (es-AR). */
function formatDateCellWithWeekday(dateStr) {
  if (!dateStr) return "—";
  const d = dateStringToLocalDate(dateStr);
  if (!d) return dateStr;
  const weekday = d.toLocaleDateString("es-AR", { weekday: "short" });
  return `${dateStr} · ${weekday}`;
}

function mercadoPaymentLabel(pm) {
  const p = String(pm || "").trim();
  if (p === "available_money") return "Dinero en cuenta";
  if (p === "bank_transfer") return "Transferencia bancaria";
  if (!p) return "Cuenta";
  return p.replace(/_/g, " ");
}

function buildMercadoDescription(row) {
  const txn = String(row.TRANSACTION_TYPE || "MOVIMIENTO").trim();
  const pm = mercadoPaymentLabel(row.PAYMENT_METHOD_TYPE);
  const parts = [txn, pm];
  if (row.SUB_UNIT) parts.push(String(row.SUB_UNIT).trim());
  if (row.BUSINESS_UNIT) parts.push(String(row.BUSINESS_UNIT).trim());
  return parts.filter(Boolean).join(" · ");
}

function categorizeMercadoRow(row, description) {
  const pm = String(row.PAYMENT_METHOD_TYPE || "");
  if (pm === "bank_transfer") return "Otros";
  const d = description.toLowerCase();
  if (d.includes("qr")) return "Otros";
  if (d.includes("wallet")) return "Otros";
  return categorize(description);
}

/** Montos tipo -1.300,00 o 30.000,00 (miles con punto, decimal con coma). */
function parseMercadoArgentineAmount(val) {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number" && !Number.isNaN(val)) return val;
  let s = String(val).trim().replace(/\s/g, "");
  if (!s) return 0;
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  if (Number.isNaN(n)) return 0;
  return neg ? -n : n;
}

function mercadoReleaseDateToDisplay(s) {
  const m = String(s).trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return String(s || "").trim();
  return `${m[1]}/${m[2]}/${m[3]}`;
}

function mercadoReleaseDateToMonthKey(s) {
  const m = String(s).trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return "";
  return `${m[3]}-${m[2]}`;
}

function categorizeMercadoNewExport(description) {
  const d = String(description || "").toLowerCase().trim();
  if (!d) return "Otros";
  if (d.includes("rendimientos")) return "Otros";
  if (d.includes("transferencia enviada") || d.includes("transferencia recibida")) return "Otros";
  if (d.includes("ingreso de dinero") || d.includes("dinero retirado")) return "Otros";
  if (d.includes("pago de servicio")) return "Servicios";
  return categorize(description);
}

function textLooksLikeMercadoNewExport(text) {
  const t = String(text).slice(0, 4000);
  return t.includes("RELEASE_DATE") && t.includes("TRANSACTION_NET_AMOUNT") && t.includes("REFERENCE_ID");
}

/** CSV nuevo (2025+): sección de saldos + RELEASE_DATE;… Montos con miles en punto y decimal en coma. Mejor leer texto plano: XLSX altera fechas y números. */
function parseMercadoDebitoCsvNewExport(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const headerIdx = lines.findIndex((l) => l.split(";")[0]?.trim() === "RELEASE_DATE");
  if (headerIdx < 0) return [];
  const headers = lines[headerIdx].split(";").map((h) => h.trim());
  const out = [];
  for (let i = headerIdx + 1; i < lines.length; i += 1) {
    const parts = lines[i].split(";");
    if (parts.length < headers.length) continue;
    const row = {};
    headers.forEach((h, j) => {
      row[h] = parts[j] !== undefined ? String(parts[j]).trim() : "";
    });
    const releaseDate = row.RELEASE_DATE || "";
    const transactionType = String(row.TRANSACTION_TYPE || "").replace(/\s+/g, " ").trim();
    const refId = row.REFERENCE_ID || "";
    const amount = parseMercadoArgentineAmount(row.TRANSACTION_NET_AMOUNT);
    if (!releaseDate && !transactionType && amount === 0) continue;
    out.push({
      date: mercadoReleaseDateToDisplay(releaseDate),
      description: transactionType,
      raw_id: String(refId),
      category: categorizeMercadoNewExport(transactionType),
      bank: "Mercado Pago",
      card_brand: "Cuenta",
      card_type: "Débito",
      card_last4: null,
      amount,
      monthKey: mercadoReleaseDateToMonthKey(releaseDate),
      is_unknown: false
    });
  }
  return out;
}

function matrixRowsToObjects(matrix, headerIdx) {
  const headers = matrix[headerIdx].map((h) => String(h ?? "").trim());
  const out = [];
  for (let i = headerIdx + 1; i < matrix.length; i += 1) {
    const r = matrix[i];
    if (!r || !r.some((c) => String(c ?? "").trim() !== "")) continue;
    const o = {};
    headers.forEach((h, j) => {
      o[h] = r[j];
    });
    out.push(o);
  }
  return out;
}

function parseMercadoDebitoLegacyObjects(rows) {
  return rows.map((row) => {
    const iso = String(row.TRANSACTION_DATE || row.SETTLEMENT_DATE || "").trim();
    const d = iso ? new Date(iso) : null;
    const date =
      d && !Number.isNaN(d.getTime())
        ? d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
        : "";
    const monthKey = d && !Number.isNaN(d.getTime()) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : "";
    const rawAmt = row.REAL_AMOUNT ?? row.TRANSACTION_AMOUNT ?? 0;
    const amount = typeof rawAmt === "number" ? rawAmt : parseFloat(String(rawAmt).replace(",", ".")) || 0;
    const description = buildMercadoDescription(row);
    return {
      date,
      description,
      raw_id: String(row.SOURCE_ID ?? ""),
      category: categorizeMercadoRow(row, description),
      bank: "Mercado Pago",
      card_brand: "Cuenta",
      card_type: "Débito",
      card_last4: null,
      amount,
      monthKey,
      is_unknown: false
    };
  });
}

function parseMercadoDebitoWorkbook(wb) {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const idxSource = matrix.findIndex((r) => String(r[0] ?? "").trim() === "SOURCE_ID");
  if (idxSource >= 0) {
    return parseMercadoDebitoLegacyObjects(matrixRowsToObjects(matrix, idxSource));
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  if (!rows.length) return [];
  const sample = rows[0];
  if (sample.SOURCE_ID !== undefined || sample.TRANSACTION_DATE !== undefined || sample.REAL_AMOUNT !== undefined) {
    return parseMercadoDebitoLegacyObjects(rows);
  }
  return [];
}

function categorize(description) {
  const d = (description || "").toLowerCase();
  if (/super|SUPERMERCADO|SUPER|Carrefour|dia|carrefour|coto|jumbo/.test(d)) return "Supermercado";
  if (/sube|transporte|bus|subte|emova|uber|cabify/.test(d)) return "Transporte";
  if (/spotify|netflix|cine|entradas|google|steam|playstation|xbox/.test(d)) return "Hobbies";
  if (/lunch|resto|pedidosya|grido|cafe|food/.test(d)) return "Pedidos";
  if (/pelu|barber|cosmeti|farmacity\s+beauty|perfume/.test(d)) return "Imagen";
  if (/teatro|bar|boliche|salida|show/.test(d)) return "Salida";
  if (/tarjeta|resumen|visa|master/.test(d)) return "Tarjetas";
  if (/expensa|alquiler|consorcio|inmobiliaria|casa/.test(d)) return "Casa";
  if (/metrogas|edenor|aysa|servicio|debito automatico/.test(d)) return "Servicios";
  if (/farm|salud|medic|osde/.test(d)) return "Salud";
  if (/galileo/.test(d)) return "Galileo";
  if (/transferencia|terceros|debin/.test(d)) return "Otros";
  return "Otros";
}

/** Categoría heurística base (sin reglas del usuario) para reaplicar reglas al vuelo. */
function baselineCategoryForExpense(e) {
  const desc = e.description || "";
  if (e.bank === "Mercado Pago") {
    const d = desc.toLowerCase();
    if (d.includes("transferencia bancaria")) return "Otros";
    if (d.includes("transferencia enviada") || d.includes("transferencia recibida")) return "Otros";
    if (d.includes("rendimientos") || d.includes("ingreso de dinero") || d.includes("dinero retirado")) return "Otros";
    if (d.includes("qr") || d.includes("wallet")) return "Otros";
  }
  return categorize(desc);
}

function reclassifyExpenseRow(e, kb, rules, availableCategories) {
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

/** Galicia débito: solo Visa / Mastercard / Cuenta; nunca máscara ni últimos dígitos en UI/DB. */
function normalizeGaliciaDebitoMedium(e) {
  if (String(e.bank || "").toLowerCase() !== "galicia") return null;
  const tipo = String(e.card_type || "").toLowerCase();
  if (!tipo.includes("débito") && !tipo.includes("debito")) return null;

  const inferred = inferCardBrand(e.description);
  const bRaw = e.card_brand;
  const b = String(bRaw ?? "").trim();
  const maskedInBrand = typeof bRaw === "string" && /\d{4}x{4,}\d{2,4}/i.test(bRaw);
  const useless = !b || b === "—" || b === "-" || maskedInBrand;

  let next = inferred;
  if (!next && !useless && (b === "Visa" || b === "Mastercard" || b === "Cuenta")) {
    next = b;
  }
  if (!next) next = "Cuenta";

  if (next === e.card_brand && (e.card_last4 == null || e.card_last4 === "")) return e;
  return { ...e, card_brand: next, card_last4: null };
}

function normalizeStoredMedium(e) {
  const galNorm = normalizeGaliciaDebitoMedium(e);
  if (galNorm !== null) return galNorm;

  const looksLikeMaskedNumber = typeof e.card_brand === "string" && /\d{4}x{4,}\d{2,4}/i.test(e.card_brand);
  const isGalicia = String(e.bank || "").toLowerCase() === "galicia";
  if (!isGalicia && !looksLikeMaskedNumber) return e;
  const inferredBrand = inferCardBrand(e.description);
  const maskedFromDesc = String(e.description || "").match(/(\d{4}X{6,}\d{2,4})/i);
  const tailDigits = maskedFromDesc ? (maskedFromDesc[1].match(/(\d{2,4})$/)?.[1] || e.card_last4 || null) : e.card_last4 || null;
  const nextBrand = inferredBrand || (looksLikeMaskedNumber ? null : e.card_brand || null);
  return {
    ...e,
    card_brand: nextBrand,
    card_last4: tailDigits
  };
}

function parsePatagoniaDebito(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const expenses = [];
  let current = null;
  const dateRe = /^(\d{2}\/\d{2}\/\d{4})(?:\s+(.*))?$/;
  const amountRe = /\$\s*([-\d\.,]+)(?:\s+\$\s*([-\d\.,]+))?/;

  for (const line of lines) {
    const dateMatch = line.match(dateRe);
    if (dateMatch) {
      if (current && current.amount !== null) expenses.push(current);
      current = { date: dateMatch[1], description: (dateMatch[2] || "").trim(), amount: null };
      continue;
    }
    if (!current) continue;
    const amountMatch = line.match(amountRe);
    if (amountMatch) {
      const debit = parseMoney(amountMatch[1]);
      const credit = amountMatch[2] ? parseMoney(amountMatch[2]) : 0;
      current.amount = debit !== 0 ? -Math.abs(debit) : Math.abs(credit);
      continue;
    }
    current.description = `${current.description} ${line.replace(/-\\s*$/g, "")}`.trim();
  }
  if (current && current.amount !== null) expenses.push(current);

  return expenses.map((e) => ({
    date: e.date,
    description: e.description,
    raw_id: "",
    category: categorize(e.description),
    bank: "Patagonia",
    card_brand: e.description.toLowerCase().includes("visa") ? "Visa" : e.description.toLowerCase().includes("master") ? "Mastercard" : null,
    card_type: e.description.toLowerCase().includes("tarjeta credito") ? "Crédito" : "Débito",
    card_last4: null,
    amount: e.amount,
    is_unknown: false
  }));
}

function parseCreditPdfGeneric(text, bank, cardBrand) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const expenses = [];
  const rowRe = /^(\d{2}[./]\d{2}[./]\d{2,4})\s+(.+?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2}-?)$/;
  for (const line of lines) {
    const m = line.match(rowRe);
    if (!m) continue;
    const description = m[2].trim();
    const amount = parseMoney(m[3]);
    if (description.toLowerCase().includes("saldo anterior")) continue;
    expenses.push({
      date: normalizeDate(m[1]),
      description,
      raw_id: "",
      category: categorize(description),
      bank,
      card_brand: cardBrand,
      card_type: "Crédito",
      card_last4: null,
      amount: amount === 0 ? 0 : amount < 0 ? amount : -Math.abs(amount),
      is_unknown: false
    });
  }
  return expenses;
}

function inferCardBrand(description) {
  const d = String(description || "").toLowerCase();
  if (d.includes("visa")) return "Visa";
  if (d.includes("master") || d.includes("maestro")) return "Mastercard";
  return null;
}

function displayExpenseMedium(e) {
  const bank = String(e.bank || "").toLowerCase();
  const tipo = String(e.card_type || "").toLowerCase();
  const galDebit = bank === "galicia" && (tipo.includes("débito") || tipo.includes("debito"));
  if (galDebit) {
    return normalizeGaliciaDebitoMedium(e).card_brand;
  }
  const tail = e.card_last4 ? ` ···${e.card_last4}` : "";
  return `${e.card_brand || "—"}${tail}`;
}

function exportMediumCsvParts(e) {
  const bank = String(e.bank || "").toLowerCase();
  const tipo = String(e.card_type || "").toLowerCase();
  const galDebit = bank === "galicia" && (tipo.includes("débito") || tipo.includes("debito"));
  if (galDebit) {
    return { brand: normalizeGaliciaDebitoMedium(e).card_brand, last4: "" };
  }
  return { brand: e.card_brand || "", last4: e.card_last4 || "" };
}

function parseGaliciaDebitoWorkbook(workbook) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const headerIdx = rows.findIndex((r) => r[0] === "Fecha" && r[1] === "Movimiento");
  if (headerIdx < 0) return [];
  const dataRows = rows.slice(headerIdx + 1).filter((r) => r[0] && r[1]);
  return dataRows.map((r) => {
    const rawDesc = String(r[1]).replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
    const debit = parseMoney(r[2]);
    const credit = parseMoney(r[3]);
    return {
      date: r[0],
      description: rawDesc,
      raw_id: "",
      category: categorize(rawDesc),
      bank: "Galicia",
      card_brand: inferCardBrand(rawDesc) || "Cuenta",
      card_type: "Débito",
      card_last4: null,
      amount: debit !== 0 ? -Math.abs(debit) : Math.abs(credit),
      is_unknown: /transferencia a terceros|debin/i.test(rawDesc)
    };
  });
}

function App() {
  const fileInputRef = useRef(null);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [allExpenses, setAllExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("Analizando tus resumenes...");
  const [knowledgeBase, setKnowledgeBase] = useState(loadKB());
  const [modalOpen, setModalOpen] = useState(false);
  const [unknownQueue, setUnknownQueue] = useState([]);
  const [currentUnknown, setCurrentUnknown] = useState(null);
  const [modalName, setModalName] = useState("");
  const [modalCat, setModalCat] = useState("Otros");
  const [filters, setFilters] = useState({
    cat: "",
    bank: "",
    card: "",
    type: "",
    month: getCurrentMonthKey(),
    flow: "",
    excludeinterAccount: true
  });
  const [analysisMessage, setAnalysisMessage] = useState("");
  const [uploadDragging, setUploadDragging] = useState(false);
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const t = sessionStorage.getItem("gastos_active_tab_v1");
      if (t === "table" || t === "import" || t === "charts") return t;
    } catch {
      /* ignore */
    }
    return "table";
  });
  const [chartMonth, setChartMonth] = useState("");
  const [showColumnConfig, setShowColumnConfig] = useState(false);
  const [showRulesConfig, setShowRulesConfig] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(loadVisibleColumns());
  const [autoCategoryRules, setAutoCategoryRules] = useState(loadAutoCategoryRules());
  const [rulesDraft, setRulesDraft] = useState(() => cloneRules(loadAutoCategoryRules()));
  const [categoryOptions, setCategoryOptions] = useState(loadCategories());
  const [categoryColors, setCategoryColors] = useState(() => loadCategoryColors());
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newSubcategoryName, setNewSubcategoryName] = useState("");
  const [subcategoryParent, setSubcategoryParent] = useState("Otros");
  const [openColorPickerFor, setOpenColorPickerFor] = useState(null);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState([]);
  const [tableSort, setTableSort] = useState({ key: "date", dir: "desc" });

  const categoryPaletteIndex = (catName) => paletteSwatchIndexForCategory(catName, categoryColors);
  const categoryVisualStyle = (catName) => {
    const { bg, fg } = resolveCategoryVisual(catName, categoryColors);
    return { backgroundColor: bg, color: fg };
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await loadAllExpenses();
        if (cancelled || rows.length === 0) return;
        // No reclasificar al cargar: lo guardado en IndexedDB (p. ej. categoría editada a mano) es la fuente de verdad.
        // Las reglas se reaplican solo al guardar reglas (commitRulesDraft) o al importar.
        const next = rows.map((row) => normalizeStoredMedium(row));
        let changed = false;
        for (let i = 0; i < rows.length; i += 1) {
          if (next[i].card_brand !== rows[i].card_brand || next[i].card_last4 !== rows[i].card_last4) {
            changed = true;
            break;
          }
        }
        if (changed) {
          const ts = Date.now();
          const toSave = next.filter(
            (e, i) =>
              e.id && (e.card_brand !== rows[i].card_brand || e.card_last4 !== rows[i].card_last4)
          );
          if (toSave.length > 0) {
            void Promise.all(toSave.map((e) => putExpense({ ...e, savedAt: ts }))).catch(() => {});
          }
        }
        setCategoryOptions((prev) => {
          const fromRows = [...new Set(next.map((r) => r.category).filter(Boolean))];
          return sortCategoriesList([...prev, ...fromRows]);
        });
        setAllExpenses(next);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem("gastos_active_tab_v1", activeTab);
    } catch {
      /* ignore */
    }
  }, [activeTab]);

  useEffect(() => {
    saveVisibleColumns(visibleColumns);
  }, [visibleColumns]);

  useEffect(() => {
    saveAutoCategoryRules(autoCategoryRules);
  }, [autoCategoryRules]);

  useEffect(() => {
    saveCategories(categoryOptions);
  }, [categoryOptions]);

  useEffect(() => {
    saveCategoryColors(categoryColors);
  }, [categoryColors]);

  useEffect(() => {
    if (!categoryOptions.includes(modalCat)) {
      setModalCat(categoryOptions[0] || "Otros");
    }
  }, [categoryOptions, modalCat]);

  useEffect(() => {
    if (!showRulesConfig) return;
    setRulesDraft(cloneRules(autoCategoryRules));
    // Borrador = reglas confirmadas solo al abrir el panel (no incluir autoCategoryRules en deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRulesConfig]);

  const filteredExpenses = useMemo(
    () =>
      allExpenses.filter(
        (e) =>
          (!filters.month || e.monthKey === filters.month) &&
          (!filters.cat || e.category === filters.cat) &&
          (!filters.bank || e.bank === filters.bank) &&
          (!filters.card || e.card_brand === filters.card) &&
          (!filters.type || e.card_type === filters.type) &&
          (!filters.flow || (filters.flow === "in" ? Number(e.amount) > 0 : Number(e.amount) < 0)) &&
          (!filters.excludeinterAccount || !isInterAccountMovement(e))
      ),
    [allExpenses, filters]
  );

  const sortedFilteredExpenses = useMemo(() => {
    const sorted = [...filteredExpenses];
    const dir = tableSort.dir === "asc" ? 1 : -1;
    const cmpText = (a, b) => String(a || "").localeCompare(String(b || ""), "es", { sensitivity: "base" });
    sorted.sort((a, b) => {
      switch (tableSort.key) {
        case "date":
          return (parseDateForSort(a.date) - parseDateForSort(b.date)) * dir;
        case "description":
          return cmpText(a.description, b.description) * dir;
        case "category":
          return cmpText(a.category, b.category) * dir;
        case "bank":
          return cmpText(a.bank, b.bank) * dir;
        case "medium":
          return cmpText(displayExpenseMedium(a), displayExpenseMedium(b)) * dir;
        case "type":
          return cmpText(a.card_type, b.card_type) * dir;
        case "source":
          return cmpText(a.sourceFile, b.sourceFile) * dir;
        case "amount":
          return (Number(a.amount || 0) - Number(b.amount || 0)) * dir;
        default:
          return (parseDateForSort(a.date) - parseDateForSort(b.date)) * -1;
      }
    });
    return sorted;
  }, [filteredExpenses, tableSort]);

  const selectionSummary = useMemo(() => {
    const idSet = new Set(selectedExpenseIds);
    const list = allExpenses.filter((e) => e.id && idSet.has(e.id));
    const total = list.reduce((acc, e) => acc + Number(e.amount || 0), 0);
    const gastosNeg = list.filter((e) => Number(e.amount) < 0);
    const sumaGastos = gastosNeg.reduce((acc, e) => acc + Math.abs(Number(e.amount || 0)), 0);
    return { list, total, count: list.length, sumaGastos };
  }, [allExpenses, selectedExpenseIds]);

  const visibleRowsWithId = useMemo(() => sortedFilteredExpenses.filter((e) => e.id), [sortedFilteredExpenses]);
  const allVisibleSelected =
    visibleRowsWithId.length > 0 && visibleRowsWithId.every((e) => selectedExpenseIds.includes(e.id));

  const banks = useMemo(
    () => [...new Set(allExpenses.map((e) => e.bank).filter(Boolean))].sort(),
    [allExpenses]
  );
  const cards = useMemo(
    () => [...new Set(allExpenses.map((e) => e.card_brand).filter(Boolean))].sort(),
    [allExpenses]
  );
  const categories = useMemo(
    () => sortCategoriesList([...categoryOptions, ...allExpenses.map((e) => e.category).filter(Boolean)]),
    [allExpenses, categoryOptions]
  );
  const rootCategories = useMemo(() => {
    const base = categories.filter((c) => !String(c).includes(" / "));
    return base.length ? base : ["Otros"];
  }, [categories]);

  const monthOptions = useMemo(() => {
    const keys = [...new Set(allExpenses.map((e) => e.monthKey).filter(Boolean))].sort().reverse();
    return keys.map((k) => {
      const [y, m] = k.split("-");
      const d = new Date(Number(y), Number(m) - 1, 1);
      let label = d.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
      label = label.charAt(0).toUpperCase() + label.slice(1);
      return { value: k, label };
    });
  }, [allExpenses]);

  useEffect(() => {
    if (monthOptions.length === 0) {
      setChartMonth("");
      return;
    }
    if (!chartMonth || !monthOptions.some((m) => m.value === chartMonth)) {
      setChartMonth(monthOptions[0].value);
    }
  }, [monthOptions, chartMonth]);

  useEffect(() => {
    if (monthOptions.length === 0) return;
    setFilters((prev) => {
      const isValid = prev.month && monthOptions.some((m) => m.value === prev.month);
      if (isValid && prev.excludeinterAccount) return prev;
      const currentMonth = getCurrentMonthKey();
      const fallback = monthOptions[0]?.value || "";
      return {
        ...prev,
        month: isValid ? prev.month : monthOptions.some((m) => m.value === currentMonth) ? currentMonth : fallback,
        excludeinterAccount: true
      };
    });
  }, [monthOptions]);

  const chartInsights = useMemo(() => {
    const month = chartMonth;
    if (!month) {
      return {
        totalGastos: 0,
        countGastos: 0,
        pieSlices: [],
        topGastos: [],
        dailyBars: [],
        maxDay: 1
      };
    }
    const inMonth = allExpenses.filter(
      (e) => e.monthKey === month && !isInterAccountMovement(e) && !isCardBillPayment(e)
    );
    const gastos = inMonth.filter((e) => Number(e.amount) < 0);
    const totalGastos = gastos.reduce((s, e) => s + Math.abs(Number(e.amount || 0)), 0);
    const byCat = {};
    gastos.forEach((e) => {
      const c = e.category || "Otros";
      byCat[c] = (byCat[c] || 0) + Math.abs(Number(e.amount || 0));
    });
    const pieEntries = Object.entries(byCat)
      .map(([label, value]) => ({ label, value }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);
    const pieSlices = buildPieSlices(pieEntries);
    const byDescription = {};
    gastos.forEach((e) => {
      const rawDesc = String(e.description || "").trim();
      const key = normalizeText(rawDesc).replace(/\s+/g, " ");
      const desc = rawDesc || "—";
      const amount = Math.abs(Number(e.amount || 0));
      if (!byDescription[key]) {
        byDescription[key] = {
          key: key || desc,
          description: desc,
          total: 0,
          count: 0,
          byCat: {}
        };
      }
      byDescription[key].total += amount;
      byDescription[key].count += 1;
      const cat = e.category || "Otros";
      byDescription[key].byCat[cat] = (byDescription[key].byCat[cat] || 0) + amount;
    });
    const topGastos = Object.values(byDescription)
      .map((g) => {
        const topCat = Object.entries(g.byCat).sort((a, b) => b[1] - a[1])[0]?.[0] || "Otros";
        return {
          ...g,
          category: topCat
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
    const byDay = {};
    gastos.forEach((e) => {
      const dk = expenseDayKey(e.date);
      if (!dk) return;
      byDay[dk] = (byDay[dk] || 0) + Math.abs(Number(e.amount || 0));
    });
    const dayKeys = Object.keys(byDay).sort();
    const dailyBars = dayKeys.map((k) => ({ day: k, total: byDay[k] }));
    const maxDay = dailyBars.length ? Math.max(...dailyBars.map((d) => d.total), 1) : 1;
    return {
      totalGastos,
      countGastos: gastos.length,
      pieSlices,
      topGastos,
      dailyBars,
      maxDay
    };
  }, [allExpenses, chartMonth]);

  const stats = useMemo(() => {
    const gastos = filteredExpenses.filter((e) => e.amount < 0);
    const total = gastos.reduce((acc, e) => acc + Math.abs(e.amount), 0);
    const byCat = {};
    gastos.forEach((e) => {
      byCat[e.category] = (byCat[e.category] || 0) + Math.abs(e.amount);
    });
    const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
    return {
      total,
      count: gastos.length,
      movements: filteredExpenses.length,
      banks: new Set(filteredExpenses.map((e) => e.bank).filter(Boolean)).size,
      top
    };
  }, [filteredExpenses]);

  function fileTypeTag(name) {
    const ext = name.split(".").pop().toLowerCase();
    if (ext === "pdf") return "PDF";
    if (ext === "csv") return "CSV";
    if (ext === "xlsx" || ext === "xls") return "Excel";
    return "TXT";
  }

  async function readFileContent(file) {
    const ext = file.name.split(".").pop().toLowerCase();
    if (ext === "xlsx" || ext === "xls" || ext === "csv") {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const wb = XLSX.read(e.target.result, { type: "array" });
            let text = "";
            wb.SheetNames.forEach((name) => {
              text += `[Hoja: ${name}]\n`;
              text += XLSX.utils.sheet_to_csv(wb.Sheets[name]);
              text += "\n\n";
            });
            resolve(text);
          } catch {
            resolve("");
          }
        };
        reader.readAsArrayBuffer(file);
      });
    }
    if (ext === "pdf") {
      const bytes = await file.arrayBuffer();
      const pdf = await getDocument({ data: bytes }).promise;
      let text = "";
      for (let p = 1; p <= pdf.numPages; p += 1) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        const lines = [];
        let currentLine = "";
        for (const item of content.items) {
          const token = (item.str || "").trim();
          if (token) {
            currentLine = currentLine ? `${currentLine} ${token}` : token;
          }
          if (item.hasEOL && currentLine) {
            lines.push(currentLine);
            currentLine = "";
          }
        }
        if (currentLine) lines.push(currentLine);
        text += `${lines.join("\n")}\n`;
      }
      return text;
    }
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => resolve("");
      reader.readAsText(file, "utf-8");
    });
  }

  async function startAnalysis() {
    setAnalysisMessage("");
    setLoading(true);
    const steps = ["Leyendo archivos...", "Detectando transacciones...", "Identificando tarjetas y bancos...", "Categorizando gastos..."];
    let idx = 0;
    const interval = setInterval(() => {
      idx = (idx + 1) % steps.length;
      setLoadingText(steps[idx]);
    }, 2000);

    try {
      const parsedExpenses = [];
      for (const f of uploadedFiles) {
        const sourceFile = f.name;
        let type = detectStatementType(f.name);
        if (type === "unknown") {
          const head = await f.slice(0, 2000).text();
          if (looksLikeMercadoPagoCsv(head)) type = "mercado-debito";
        }

        if (type === "mercado-debito") {
          const ext = (f.name.split(".").pop() || "").toLowerCase();
          if (ext === "csv") {
            const text = await f.text();
            if (textLooksLikeMercadoNewExport(text)) {
              parsedExpenses.push(...parseMercadoDebitoCsvNewExport(text).map((row) => ({ ...row, sourceFile })));
            } else {
              const wb = XLSX.read(text, { type: "string", FS: ";" });
              parsedExpenses.push(...parseMercadoDebitoWorkbook(wb).map((row) => ({ ...row, sourceFile })));
            }
          } else {
            const wb = XLSX.read(await f.arrayBuffer(), { type: "array", FS: ";" });
            parsedExpenses.push(...parseMercadoDebitoWorkbook(wb).map((row) => ({ ...row, sourceFile })));
          }
          continue;
        }

        const content = await readFileContent(f);
        if (type === "patagonia-debito") {
          parsedExpenses.push(...parsePatagoniaDebito(content).map((row) => ({ ...row, sourceFile })));
          continue;
        }
        if (type === "patagonia-credito-visa") {
          parsedExpenses.push(...parseCreditPdfGeneric(content, "Patagonia", "Visa").map((row) => ({ ...row, sourceFile })));
          continue;
        }
        if (type === "patagonia-credito-master") {
          parsedExpenses.push(...parseCreditPdfGeneric(content, "Patagonia", "Mastercard").map((row) => ({ ...row, sourceFile })));
          continue;
        }
        if (type === "galicia-credito-visa") {
          parsedExpenses.push(...parseCreditPdfGeneric(content, "Galicia", "Visa").map((row) => ({ ...row, sourceFile })));
          continue;
        }
        if (type === "galicia-credito-master") {
          parsedExpenses.push(...parseCreditPdfGeneric(content, "Galicia", "Mastercard").map((row) => ({ ...row, sourceFile })));
          continue;
        }
        if (type === "galicia-debito") {
          const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
          parsedExpenses.push(...parseGaliciaDebitoWorkbook(wb).map((row) => ({ ...row, sourceFile })));
          continue;
        }
      }
      const expenses = parsedExpenses.map((e) => {
        const monthKey = e.monthKey || deriveMonthKey(e.date);
        if (e.raw_id && knowledgeBase[e.raw_id]) {
          return {
            ...e,
            monthKey,
            description: knowledgeBase[e.raw_id].name,
            category: normalizeCategory(knowledgeBase[e.raw_id].category),
            is_unknown: false
          };
        }
        const withConfiguredCategory = applyConfiguredCategory({ ...e, monthKey }, autoCategoryRules, categoryOptions);
        return {
          ...withConfiguredCategory,
          category: safeCategory(normalizeCategory(withConfiguredCategory.category), categoryOptions)
        };
      });
      const queue = [...new Set(expenses.filter((e) => e.is_unknown && e.raw_id).map((e) => e.raw_id).filter((id) => !knowledgeBase[id]))];

      if (expenses.length === 0) {
        setAnalysisMessage("No se detectaron transacciones para los archivos seleccionados. Revisemos el parser de ese formato.");
      } else {
        const records = expenses.map((e) => buildStoredExpense(e, e.sourceFile || "unknown"));
        const added = [];
        const skipped = [];
        for (const rec of records) {
          const result = await addExpenseIfNew(rec);
          if (result.added) added.push(result.record);
          else skipped.push(rec);
        }
        setAllExpenses((prev) => {
          const keys = new Set(prev.map((p) => p.dedupeKey));
          const next = [...prev];
          for (const r of added) {
            if (!keys.has(r.dedupeKey)) {
              keys.add(r.dedupeKey);
              next.push(r);
            }
          }
          return next;
        });
        const gastosNuevos = added.filter((r) => Number(r.amount) < 0).length;
        const ingresosNuevos = added.filter((r) => Number(r.amount) > 0).length;
        if (added.length === 0 && skipped.length === records.length) {
          setAnalysisMessage("Todos los movimientos de esta importación ya estaban guardados (misma clave de duplicado).");
        } else if (skipped.length > 0) {
          setAnalysisMessage(
            `Se cargaron ${gastosNuevos} gastos nuevos${ingresosNuevos ? ` y ${ingresosNuevos} ingresos` : ""} (${added.length} movimientos). ${skipped.length} duplicados omitidos.`
          );
        } else {
          setAnalysisMessage(
            `Se cargaron ${gastosNuevos} gastos nuevos${ingresosNuevos ? ` y ${ingresosNuevos} ingresos` : ""} (${added.length} movimientos en total). Quedan guardados en este navegador (IndexedDB).`
          );
        }
      }
      setUnknownQueue(queue);
      if (queue.length > 0) {
        setCurrentUnknown(queue[0]);
        setModalOpen(true);
      }
    } catch (err) {
      alert(`Error al analizar: ${err.message}`);
    } finally {
      clearInterval(interval);
      setLoading(false);
      setLoadingText("Analizando tus resumenes...");
    }
  }

  function removeFile(index) {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function updateUnknown(save) {
    if (!currentUnknown) return;
    if (save && modalName.trim()) {
      const updated = {
        ...knowledgeBase,
        [currentUnknown]: { name: modalName.trim(), category: normalizeCategory(modalCat) }
      };
      setKnowledgeBase(updated);
      saveKB(updated);
      setAllExpenses((prev) => {
        const next = prev.map((e) =>
          e.raw_id === currentUnknown
            ? { ...e, description: modalName.trim(), category: modalCat, is_unknown: false }
            : e
        );
        const toSave = next.filter((e) => e.raw_id === currentUnknown && e.id);
        void Promise.all(toSave.map((e) => putExpense({ ...e, savedAt: Date.now() }))).catch(() => {});
        return next;
      });
    }

    const rest = unknownQueue.slice(1);
    setUnknownQueue(rest);
    setModalName("");
    if (rest.length === 0) {
      setCurrentUnknown(null);
      setModalOpen(false);
      return;
    }
    setCurrentUnknown(rest[0]);
  }

  function exportFile(type) {
    const data = sortedFilteredExpenses;
    if (type === "csv") {
      const header = "Fecha,Descripcion,Categoria,Banco,Tarjeta,Tipo,Ultimos4,Monto,Origen";
      const rows = data.map((e) => {
        const { brand, last4 } = exportMediumCsvParts(e);
        return `"${e.date || ""}","${e.description || ""}","${e.category || ""}","${e.bank || ""}","${brand}","${e.card_type || ""}","${last4}","${e.amount}","${e.sourceFile || ""}"`;
      });
      const blob = new Blob([`${header}\n${rows.join("\n")}`], { type: "text/csv;charset=utf-8;" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "gastos_filtrados.csv";
      a.click();
      return;
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "gastos_filtrados.json";
    a.click();
  }

  function clearImportQueue() {
    setUploadedFiles([]);
    setAnalysisMessage("");
  }

  async function clearStoredExpenses() {
    if (
      !confirm(
        "¿Borrar todos los gastos guardados en este navegador? Los datos en IndexedDB se eliminan y no se puede deshacer."
      )
    ) {
      return;
    }
    try {
      await clearAllExpenses();
      setAllExpenses([]);
      setSelectedExpenseIds([]);
      setFilters({ cat: "", bank: "", card: "", type: "", month: getCurrentMonthKey(), flow: "", excludeinterAccount: true });
      setAnalysisMessage("");
    } catch (e) {
      alert(`No se pudo borrar el historial: ${e.message}`);
    }
  }

  function addFiles(fileList) {
    const next = Array.from(fileList || []).filter(Boolean);
    if (next.length) setUploadedFiles((prev) => [...prev, ...next]);
  }

  const visibleColumnCount = COLUMN_DEFS.filter((col) => visibleColumns[col.id]).length || 1;
  const tableColSpan = visibleColumnCount + 1;
  function toggleColumn(columnId) {
    setVisibleColumns((prev) => {
      const enabled = Object.values(prev).filter(Boolean).length;
      if (prev[columnId] && enabled === 1) return prev;
      return { ...prev, [columnId]: !prev[columnId] };
    });
  }

  function updateKeywordRule(index, patch) {
    setRulesDraft((prev) => ({
      ...prev,
      keywordRules: prev.keywordRules.map((r, i) => (i === index ? { ...r, ...patch } : r))
    }));
  }

  function updateTransferRule(index, patch) {
    setRulesDraft((prev) => ({
      ...prev,
      transferRules: prev.transferRules.map((r, i) => (i === index ? { ...r, ...patch } : r))
    }));
  }

  function commitRulesDraft() {
    const next = cloneRules(rulesDraft);
    setAutoCategoryRules(next);
    saveAutoCategoryRules(next);
    setAllExpenses((prev) => {
      if (!prev.length) return prev;
      const out = prev.map((e) =>
        e.categoryManual ? e : reclassifyExpenseRow(e, knowledgeBase, next, categoryOptions)
      );
      let changed = false;
      for (let i = 0; i < prev.length; i += 1) {
        if (
          out[i].category !== prev[i].category ||
          out[i].description !== prev[i].description ||
          out[i].is_unknown !== prev[i].is_unknown
        ) {
          changed = true;
          break;
        }
      }
      if (!changed) return prev;
      const toSave = out.filter(
        (e, i) =>
          e.id && (e.category !== prev[i].category || e.description !== prev[i].description || e.is_unknown !== prev[i].is_unknown)
      );
      if (toSave.length > 0) {
        const ts = Date.now();
        void Promise.all(toSave.map((e) => putExpense({ ...e, savedAt: ts }))).catch(() => {});
      }
      return out;
    });
  }

  function addCategory() {
    const normalized = String(newCategoryName || "").trim();
    if (!normalized) return;
    if (categoryOptions.includes(normalized)) {
      setNewCategoryName("");
      return;
    }
    setCategoryOptions((prev) => sortCategoriesList([...prev, normalized]));
    setCategoryColors((prev) => ({
      ...prev,
      [normalized]: prev[normalized] ?? categoryFallbackColorIndex(normalized)
    }));
    setNewCategoryName("");
  }

  function addSubcategory() {
    const sub = String(newSubcategoryName || "").trim();
    const parent = String(subcategoryParent || "").trim() || "Otros";
    if (!sub) return;
    const nextCat = `${parent} / ${sub}`;
    if (categoryOptions.includes(nextCat)) {
      setNewSubcategoryName("");
      return;
    }
    setCategoryOptions((prev) => sortCategoriesList([...prev, nextCat]));
    setCategoryColors((prev) => ({
      ...prev,
      [nextCat]: prev[nextCat] ?? categoryFallbackColorIndex(nextCat)
    }));
    setNewSubcategoryName("");
  }

  function removeCategory(category) {
    if (category === "Otros") return;
    const removedSet = new Set(
      categoryOptions.filter((c) => c === category || String(c).startsWith(`${category} / `))
    );
    setCategoryOptions((prev) => prev.filter((c) => !removedSet.has(c)));
    const patchRuleCats = (prev) => ({
      keywordRules: prev.keywordRules.map((r) => (removedSet.has(r.category) ? { ...r, category: "Otros" } : r)),
      transferRules: prev.transferRules.map((r) => (removedSet.has(r.category) ? { ...r, category: "Otros" } : r))
    });
    setAutoCategoryRules((prev) => patchRuleCats(prev));
    setRulesDraft((prev) => patchRuleCats(prev));
    setKnowledgeBase((prev) => {
      const next = Object.fromEntries(
        Object.entries(prev).map(([k, v]) => [k, { ...v, category: removedSet.has(v.category) ? "Otros" : v.category }])
      );
      saveKB(next);
      return next;
    });
    setAllExpenses((prev) => {
      const touched = prev
        .filter((e) => removedSet.has(e.category) && e.id)
        .map((e) => ({ ...e, category: "Otros", categoryManual: false, savedAt: Date.now() }));
      const next = prev.map((e) =>
        removedSet.has(e.category) ? { ...e, category: "Otros", categoryManual: false, savedAt: Date.now() } : e
      );
      if (touched.length > 0) {
        void Promise.all(touched.map((e) => putExpense(e))).catch(() => {});
      }
      return next;
    });
    setFilters((prev) => (removedSet.has(prev.cat) ? { ...prev, cat: "" } : prev));
    setCategoryColors((prev) => {
      const next = { ...prev };
      removedSet.forEach((c) => {
        delete next[c];
      });
      return next;
    });
  }

  function toggleExpenseSelected(id) {
    if (!id) return;
    setSelectedExpenseIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSelectAllVisible() {
    const ids = visibleRowsWithId.map((e) => e.id).filter(Boolean);
    if (!ids.length) return;
    if (allVisibleSelected) {
      const drop = new Set(ids);
      setSelectedExpenseIds((prev) => prev.filter((x) => !drop.has(x)));
    } else {
      setSelectedExpenseIds((prev) => [...new Set([...prev, ...ids])]);
    }
  }

  function setCategoryColor(cat, idx) {
    setCategoryColors((prev) => ({ ...prev, [cat]: Math.abs(Number(idx)) % CAT_PALETTE_COUNT }));
    setOpenColorPickerFor(null);
  }

  function setCategoryHexColor(cat, hex) {
    const parsed = parseHexColor(hex);
    if (!parsed) return;
    setCategoryColors((prev) => ({ ...prev, [cat]: parsed }));
    setOpenColorPickerFor(null);
  }

  function updateExpenseCategory(expense, newCategoryRaw) {
    const cat = normalizeCategory(String(newCategoryRaw || "").trim() || "Otros");
    setCategoryOptions((prev) => (prev.includes(cat) ? prev : sortCategoriesList([...prev, cat])));
    setCategoryColors((prev) => (prev[cat] !== undefined ? prev : { ...prev, [cat]: categoryFallbackColorIndex(cat) }));
    setAllExpenses((prev) => {
      const next = prev.map((row) => {
        if (expense.id && row.id === expense.id) {
          return { ...row, category: cat, categoryManual: true, savedAt: Date.now() };
        }
        if (!expense.id && row.dedupeKey && row.dedupeKey === expense.dedupeKey) {
          return { ...row, category: cat, categoryManual: true, savedAt: Date.now() };
        }
        return row;
      });
      const updated = next.find((r) =>
        expense.id ? r.id === expense.id : expense.dedupeKey && r.dedupeKey === expense.dedupeKey
      );
      if (updated?.id) {
        void putExpense(updated).catch(() => {});
      }
      return next;
    });
  }

  function toggleTableSort(key) {
    setTableSort((prev) => {
      if (prev.key === key) return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      return { key, dir: key === "amount" ? "desc" : "asc" };
    });
  }

  function renderSortableHeader(label, key, align = "left") {
    const isActive = tableSort.key === key;
    const arrow = isActive ? (tableSort.dir === "asc" ? "▲" : "▼") : "↕";
    return (
      <th style={{ textAlign: align }}>
        <button
          type="button"
          className={`th-sort-btn${isActive ? " is-active" : ""}`}
          onClick={() => toggleTableSort(key)}
          aria-label={`Ordenar por ${label}`}
        >
          <span>{label}</span>
          <span className="th-sort-arrow">{arrow}</span>
        </button>
      </th>
    );
  }

  async function deleteSelectedExpenses() {
    const ids = selectionSummary.list.map((e) => e.id).filter(Boolean);
    if (!ids.length) return;
    if (!confirm(`¿Eliminar ${ids.length} movimiento(s) guardados? No se puede deshacer.`)) return;
    try {
      await deleteExpensesByIds(ids);
      setAllExpenses((prev) => prev.filter((e) => !e.id || !ids.includes(e.id)));
      setSelectedExpenseIds([]);
    } catch (err) {
      alert(`No se pudo eliminar: ${err.message}`);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Mis gastos del mes</h1>
        <p>Resúmenes Patagonia, Galicia y Mercado Pago · Todo se procesa en tu navegador</p>
      </header>

      <nav className="app-tabs" role="tablist" aria-label="Secciones">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "table"}
          className={`app-tab${activeTab === "table" ? " app-tab-active" : ""}`}
          onClick={() => setActiveTab("table")}
        >
          Tabla
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "import"}
          className={`app-tab${activeTab === "import" ? " app-tab-active" : ""}`}
          onClick={() => setActiveTab("import")}
        >
          Importar
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "charts"}
          className={`app-tab${activeTab === "charts" ? " app-tab-active" : ""}`}
          onClick={() => setActiveTab("charts")}
        >
          Gráficos
        </button>
      </nav>

      {!loading && activeTab === "import" && (
        <section className="panel">
          <h2 className="panel-title">Importar archivos</h2>
          <div
            className={`upload-zone${uploadDragging ? " drag-over" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setUploadDragging(true);
            }}
            onDragLeave={() => setUploadDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setUploadDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
            }}
          >
            <div className="upload-icon" aria-hidden="true">
              📄
            </div>
            <div className="upload-title">Arrastrá archivos o hacé clic para elegirlos</div>
            <div className="upload-hint">PDF · CSV · XLSX · Múltiples bancos en un solo análisis</div>
            <input
              ref={fileInputRef}
              style={{ display: "none" }}
              type="file"
              multiple
              accept=".pdf,.txt,.csv,.xls,.xlsx"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          <div className="files-list">
            {uploadedFiles.map((f, idx) => (
              <div key={`${f.name}-${idx}`} className="file-item">
                <span className="fname" title={f.name}>
                  {f.name}
                </span>
                <span className="chip">{fileTypeTag(f.name)}</span>
                <button type="button" className="btn-icon" title="Quitar" onClick={() => removeFile(idx)}>
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div className="actions-row">
            <button type="button" className="btn-primary" disabled={uploadedFiles.length === 0} onClick={startAnalysis}>
              Analizar resúmenes
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={uploadedFiles.length === 0 && !analysisMessage}
              onClick={clearImportQueue}
            >
              Limpiar cola
            </button>
            <button type="button" className="btn-ghost btn-danger" disabled={allExpenses.length === 0} onClick={clearStoredExpenses}>
              Borrar historial
            </button>
          </div>
          {analysisMessage && <div className="alert-inline">{analysisMessage}</div>}
        </section>
      )}

      {loading && (
        <div className="loading-block panel">
          <div className="loading-spinner" aria-hidden="true" />
          <div className="loading-text">{loadingText}</div>
        </div>
      )}

      {!loading && activeTab === "table" && allExpenses.length === 0 && (
        <section className="panel empty-tab-hint">
          <h2 className="panel-title">Sin datos todavía</h2>
          <p className="empty-tab-text">
            Importá resúmenes en la pestaña <strong>Importar</strong> para ver la tabla de movimientos y filtros.
          </p>
          <button type="button" className="btn-primary" onClick={() => setActiveTab("import")}>
            Ir a importar
          </button>
        </section>
      )}

      {!loading && activeTab === "table" && allExpenses.length > 0 && (
        <section className="results-section panel">
          <h2 className="panel-title">Resultados</h2>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Total gastos (vista actual)</div>
              <div className="stat-value negative">
                ${stats.total.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Cant. gastos</div>
              <div className="stat-value muted">{stats.count}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Movimientos en vista</div>
              <div className="stat-value muted">{stats.movements}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Top categoría</div>
              <div className="stat-value muted">{stats.top?.[0] || "—"}</div>
            </div>
          </div>

          <div className="filter-checkbox-bar">
            <label
              className="filter-checkbox-item"
              title="Ej.: DEBITO DEBIN RECURRENTE…, TRANSF. CTAS PROPIAS…, RESCATE FIMA…"
            >
              <input
                id="filter-inter-account"
                type="checkbox"
                checked={Boolean(filters.excludeinterAccount)}
                onChange={(e) => setFilters((prev) => ({ ...prev, excludeinterAccount: e.target.checked }))}
              />
              <span>Excluir movimientos entre cuentas</span>
            </label>
          </div>

          <div className="filters-toolbar">
            <div className="filter-group">
              <label htmlFor="filter-month">Mes</label>
              <select
                id="filter-month"
                value={filters.month}
                onChange={(e) => setFilters((prev) => ({ ...prev, month: e.target.value }))}
              >
                <option value="">Todos los meses</option>
                {monthOptions.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label htmlFor="filter-cat">Categoría</label>
              <select
                id="filter-cat"
                value={filters.cat}
                onChange={(e) => setFilters((prev) => ({ ...prev, cat: e.target.value }))}
              >
                <option value="">Todas</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label htmlFor="filter-bank">Banco / cuenta</label>
              <select
                id="filter-bank"
                value={filters.bank}
                onChange={(e) => setFilters((prev) => ({ ...prev, bank: e.target.value }))}
              >
                <option value="">Todos</option>
                {banks.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label htmlFor="filter-card">Marca / medio</label>
              <select
                id="filter-card"
                value={filters.card}
                onChange={(e) => setFilters((prev) => ({ ...prev, card: e.target.value }))}
              >
                <option value="">Todas</option>
                {cards.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label htmlFor="filter-type">Tipo</label>
              <select
                id="filter-type"
                value={filters.type}
                onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value }))}
              >
                <option value="">Crédito / Débito</option>
                <option value="Crédito">Crédito</option>
                <option value="Débito">Débito</option>
              </select>
            </div>
            <div className="filter-group">
              <label htmlFor="filter-flow">Flujo</label>
              <select
                id="filter-flow"
                value={filters.flow}
                onChange={(e) => setFilters((prev) => ({ ...prev, flow: e.target.value }))}
              >
                <option value="">Entradas + salidas</option>
                <option value="in">Solo entradas</option>
                <option value="out">Solo salidas</option>
              </select>
            </div>
            <div className="filter-group">
              <label>Categorizacion</label>
              <button type="button" className="btn-ghost" onClick={() => setShowRulesConfig((v) => !v)}>
                {showRulesConfig ? "Ocultar reglas" : "Configurar reglas"}
              </button>
            </div>
          </div>

          <div className="column-config-mini-row">
            <span className="column-config-mini-label">Columnas</span>
            <button
              type="button"
              className={`btn-column-mini${showColumnConfig ? " is-open" : ""}`}
              onClick={() => setShowColumnConfig((v) => !v)}
              title={showColumnConfig ? "Ocultar columnas" : "Configurar columnas"}
              aria-label={showColumnConfig ? "Ocultar columnas" : "Configurar columnas"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="100" height="100" viewBox="0 0 50 50">
<path d="M 32.21875 2.0625 L 31.4375 2.375 L 28.625 3.46875 L 27.84375 3.78125 L 28.03125 4.59375 L 28.625 7.59375 C 28.332031 7.886719 28.019531 8.230469 27.6875 8.59375 L 24.71875 7.9375 L 23.90625 7.75 L 23.59375 8.5 L 22.375 11.3125 L 22.0625 12.0625 L 22.75 12.53125 L 25.3125 14.25 C 25.28125 14.738281 25.285156 15.230469 25.3125 15.71875 L 22.6875 17.34375 L 21.96875 17.78125 L 22.28125 18.5625 L 23.375 21.375 L 23.6875 22.15625 L 24.5 21.96875 L 27.5 21.375 C 27.804688 21.738281 28.140625 22.066406 28.5 22.375 L 27.8125 25.375 L 27.625 26.1875 L 28.40625 26.53125 L 31.21875 27.71875 L 31.96875 28.03125 L 32.4375 27.34375 L 34.15625 24.78125 C 34.644531 24.8125 35.136719 24.808594 35.625 24.78125 L 37.25 27.4375 L 37.6875 28.125 L 38.46875 27.84375 L 42.0625 26.40625 L 41.875 25.59375 L 41.1875 22.3125 C 41.5625 21.996094 41.902344 21.65625 42.21875 21.28125 L 45.25 22.0625 L 46.09375 22.28125 L 46.40625 21.5 L 47.625 18.6875 L 47.96875 17.90625 L 47.21875 17.4375 L 44.59375 15.84375 C 44.625 15.355469 44.621094 14.863281 44.59375 14.375 L 47.21875 12.75 L 47.9375 12.3125 L 47.625 11.53125 L 46.53125 8.71875 L 46.21875 7.9375 L 45.375 8.125 L 42.3125 8.8125 C 42.007813 8.449219 41.671875 8.121094 41.3125 7.8125 L 41.96875 4.8125 L 42.15625 4 L 41.40625 3.6875 L 38.59375 2.46875 L 37.8125 2.15625 L 37.34375 2.875 L 35.75 5.40625 C 35.289063 5.359375 34.789063 5.402344 34.28125 5.4375 L 32.65625 2.78125 Z M 31.375 4.53125 L 32.84375 6.9375 L 33.21875 7.53125 L 33.90625 7.375 C 34.613281 7.21875 35.28125 7.304688 36.1875 7.40625 L 36.8125 7.46875 L 37.15625 6.9375 L 38.59375 4.65625 L 39.84375 5.1875 L 39.21875 7.875 L 39.0625 8.53125 L 39.625 8.90625 C 40.238281 9.34375 40.75 9.855469 41.1875 10.46875 L 41.5625 11.03125 L 42.21875 10.875 L 44.96875 10.25 L 45.46875 11.5 L 43.0625 12.9375 L 42.53125 13.28125 L 42.59375 13.90625 C 42.6875 14.742188 42.6875 15.445313 42.59375 16.28125 L 42.53125 16.90625 L 43.0625 17.25 L 45.4375 18.71875 L 44.9375 19.90625 L 42.15625 19.21875 L 41.46875 19.0625 L 41.09375 19.625 C 40.65625 20.238281 40.144531 20.75 39.53125 21.1875 L 39 21.5625 L 39.125 22.21875 L 39.75 25.1875 L 38.5 25.65625 L 37.0625 23.28125 L 36.71875 22.75 L 36.09375 22.8125 C 35.257813 22.90625 34.554688 22.90625 33.71875 22.8125 L 33.09375 22.75 L 32.78125 23.25 L 31.25 25.5625 L 29.96875 25 L 30.5625 22.3125 L 30.71875 21.6875 L 30.1875 21.28125 C 29.574219 20.84375 29.0625 20.332031 28.625 19.71875 L 28.25 19.1875 L 27.59375 19.3125 L 24.90625 19.875 L 24.4375 18.625 L 26.8125 17.15625 L 27.375 16.8125 L 27.28125 16.1875 C 27.1875 15.351563 27.1875 14.648438 27.28125 13.8125 L 27.375 13.21875 L 26.84375 12.875 L 24.53125 11.34375 L 25.0625 10.0625 L 27.78125 10.6875 L 28.375 10.8125 L 28.75 10.34375 C 29.320313 9.679688 29.90625 9.09375 30.40625 8.59375 L 30.78125 8.21875 L 30.6875 7.71875 L 30.125 5.03125 Z M 35 10 C 32.25 10 30 12.25 30 15 C 30 17.75 32.25 20 35 20 C 37.75 20 40 17.75 40 15 C 40 12.25 37.75 10 35 10 Z M 35 12 C 36.667969 12 38 13.332031 38 15 C 38 16.667969 36.667969 18 35 18 C 33.332031 18 32 16.667969 32 15 C 32 13.332031 33.332031 12 35 12 Z M 13.53125 20 L 13.40625 20.84375 L 12.90625 24.09375 C 12.363281 24.265625 11.839844 24.515625 11.34375 24.78125 L 7.90625 22.28125 L 4.40625 25.78125 L 4.875 26.46875 L 6.78125 29.21875 C 6.511719 29.753906 6.273438 30.289063 6.09375 30.8125 L 2.8125 31.40625 L 2 31.5625 L 2 36.4375 L 2.8125 36.59375 L 6.09375 37.1875 C 6.269531 37.734375 6.511719 38.246094 6.78125 38.75 L 4.8125 41.40625 L 4.28125 42.09375 L 7.78125 45.59375 L 8.46875 45.125 L 11.21875 43.21875 C 11.753906 43.488281 12.289063 43.726563 12.8125 43.90625 L 13.3125 47.15625 L 13.4375 48 L 18.34375 48 L 18.46875 47.1875 L 19.09375 43.90625 C 19.636719 43.734375 20.160156 43.484375 20.65625 43.21875 L 24.09375 45.71875 L 27.59375 42.21875 L 27.125 41.53125 L 25.125 38.75 C 25.386719 38.222656 25.636719 37.703125 25.8125 37.1875 L 29.1875 36.59375 L 30 36.4375 L 30 31.53125 L 25.78125 30.90625 C 25.609375 30.367188 25.390625 29.839844 25.125 29.34375 L 27.125 26.59375 L 27.59375 25.90625 L 27.03125 25.3125 L 24.71875 22.90625 L 24.125 22.28125 L 23.40625 22.78125 L 20.65625 24.78125 C 20.128906 24.519531 19.609375 24.269531 19.09375 24.09375 L 18.59375 20.84375 L 18.46875 20 Z M 15.25 22 L 16.75 22 L 17.3125 25.5625 L 17.875 25.75 C 18.773438 26.050781 19.613281 26.332031 20.28125 26.75 L 20.84375 27.09375 L 21.375 26.71875 L 23.875 24.90625 L 25 26.09375 L 23.1875 28.625 L 22.78125 29.15625 L 23.15625 29.71875 C 23.605469 30.4375 23.957031 31.269531 24.125 32.03125 L 24.28125 32.6875 L 24.9375 32.78125 L 28 33.25 L 28 34.78125 L 24.9375 35.3125 L 24.34375 35.40625 L 24.15625 35.96875 C 23.855469 36.867188 23.574219 37.707031 23.15625 38.375 L 22.78125 38.9375 L 23.1875 39.46875 L 25 42 L 23.875 43.09375 L 21.375 41.28125 L 20.84375 40.90625 L 20.28125 41.25 C 19.5625 41.699219 18.730469 42.050781 17.96875 42.21875 L 17.34375 42.375 L 17.21875 43.03125 L 16.6875 46 L 15.15625 46 L 14.59375 42.4375 L 14.03125 42.25 C 13.132813 41.949219 12.292969 41.667969 11.625 41.25 L 11.0625 40.90625 L 10.53125 41.28125 L 8 43 L 6.90625 41.90625 L 8.6875 39.5 L 9.125 38.9375 L 8.75 38.375 C 8.300781 37.65625 7.949219 36.855469 7.78125 36.09375 L 7.625 35.4375 L 6.96875 35.3125 L 4 34.78125 L 4 33.21875 L 6.96875 32.6875 L 7.5625 32.5625 L 7.75 32.03125 C 8.050781 31.132813 8.332031 30.292969 8.75 29.625 L 9.09375 29.0625 L 8.71875 28.53125 L 7 26 L 8.125 24.90625 L 10.625 26.71875 L 11.15625 27.09375 L 11.71875 26.75 C 12.4375 26.300781 13.269531 25.949219 14.03125 25.78125 L 14.6875 25.625 L 14.78125 24.96875 Z M 16 29 C 13.253906 29 11 31.253906 11 34 C 11 36.746094 13.253906 39 16 39 C 18.746094 39 21 36.746094 21 34 C 21 31.253906 18.746094 29 16 29 Z M 16 31 C 17.65625 31 19 32.34375 19 34 C 19 35.65625 17.65625 37 16 37 C 14.34375 37 13 35.65625 13 34 C 13 32.34375 14.34375 31 16 31 Z"></path>
</svg>
            </button>
          </div>

          {showColumnConfig && (
            <div className="config-panel">
              <h3>Columnas visibles</h3>
              <div className="check-grid">
                {COLUMN_DEFS.map((col) => (
                  <label key={col.id} className="check-item">
                    <input type="checkbox" checked={Boolean(visibleColumns[col.id])} onChange={() => toggleColumn(col.id)} />
                    <span>{col.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {showRulesConfig && (
            <div className="config-panel">
              <div className="rules-toolbar">
                <button type="button" className="btn-primary btn-save-rules" onClick={commitRulesDraft}>
                  Guardar reglas
                </button>
                <span className="rules-toolbar-hint">
                  Guardá para aplicar reglas a filas automáticas y persistir. Las categorías que editaste a mano en la tabla no se
                  pisan. La knowledge base sigue teniendo prioridad en el resto.
                </span>
              </div>
              <h3>Editor de categorías</h3>
              <div className="cat-editor-layout">
                <section className="cat-editor-card">
                  <h4>Crear categoría</h4>
                  <div className="rule-row category-row">
                    <input
                      className="rule-input"
                      value={newCategoryName}
                      placeholder="Nueva categoría (ej: Mascotas)"
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addCategory();
                        }
                      }}
                    />
                    <button type="button" className="btn-ghost btn-inline btn-add-cat" onClick={addCategory}>
                      Agregar
                    </button>
                  </div>
                  <h4>Crear subcategoría</h4>
                  <div className="rule-row category-row">
                    <select
                      className="rule-cat"
                      value={subcategoryParent}
                      onChange={(e) => setSubcategoryParent(e.target.value)}
                    >
                      {rootCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                    <input
                      className="rule-input"
                      value={newSubcategoryName}
                      placeholder="Nueva subcategoría (ej: Streaming)"
                      onChange={(e) => setNewSubcategoryName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addSubcategory();
                        }
                      }}
                    />
                    <button type="button" className="btn-ghost btn-inline btn-add-cat" onClick={addSubcategory}>
                      + Subcat
                    </button>
                  </div>
                  <p className="cat-editor-help">
                    Tip: las subcategorías se guardan como <strong>Categoría / Subcategoría</strong>.
                  </p>
                </section>

                <section className="cat-editor-card">
                  <h4>Estructura actual</h4>
                  <div className="category-tree">
                {rootCategories.map((root) => {
                  const subs = categoryOptions.filter((c) => c.startsWith(`${root} / `));
                  const own = categoryOptions.includes(root) ? [root] : [];
                  const group = [...own, ...subs];
                  return (
                    <details key={root} className="cat-group" open>
                      <summary className="cat-group-summary">
                        <span>{root}</span>
                        <span className="cat-group-count">{group.length}</span>
                      </summary>
                      <div className="chip-list">
                        {group.map((cat) => {
                          const selectedIdx = categoryPaletteIndex(cat);
                          const visual = categoryVisualStyle(cat);
                          return (
                            <div key={cat} className="cat-chip-row">
                              <button
                                type="button"
                                className={`cat-palette-dot${selectedIdx === null ? "" : ` cat-palette-${selectedIdx}`}`}
                                style={selectedIdx === null ? { background: visual.backgroundColor } : undefined}
                                title="Elegir color"
                                aria-label={`Cambiar color de categoría ${cat}`}
                                onClick={() => setOpenColorPickerFor((prev) => (prev === cat ? null : cat))}
                              />
                              <span className="cat-chip" style={visual}>
                                {cat}
                              </span>
                              {openColorPickerFor === cat && (
                                <div className="cat-color-popover" role="listbox" aria-label={`Colores para ${cat}`}>
                                  {Array.from({ length: CAT_PALETTE_COUNT }, (_, idx) => (
                                    <button
                                      key={`${cat}-color-${idx}`}
                                      type="button"
                                      className={`cat-color-option cat-palette-${idx}${selectedIdx === idx ? " is-selected" : ""}`}
                                      onClick={() => setCategoryColor(cat, idx)}
                                      aria-label={`Elegir color ${idx + 1} para ${cat}`}
                                    />
                                  ))}
                                  <input
                                    type="color"
                                    className="cat-color-picker"
                                    value={resolveCategoryVisual(cat, categoryColors).bg}
                                    onChange={(e) => setCategoryHexColor(cat, e.target.value)}
                                    aria-label={`Color personalizado para ${cat}`}
                                  />
                                </div>
                              )}
                              {cat !== "Otros" && (
                                <button type="button" className="chip-remove" onClick={() => removeCategory(cat)} aria-label={`Quitar ${cat}`}>
                                  ×
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  );
                })}
                  </div>
                </section>
              </div>

              <h3>Reglas por palabra clave</h3>
              {rulesDraft.keywordRules.map((rule, idx) => (
                <div key={`kw-${idx}`} className="rule-row">
                  <input
                    className="rule-input"
                    value={rule.keyword || ""}
                    placeholder="Palabra o frase"
                    onChange={(e) => updateKeywordRule(idx, { keyword: e.target.value })}
                  />
                  <select
                    className="rule-cat"
                    value={rule.category || "Otros"}
                    onChange={(e) => updateKeywordRule(idx, { category: e.target.value })}
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="rule-remove"
                    title="Quitar regla"
                    aria-label="Quitar regla"
                    onClick={() =>
                      setRulesDraft((prev) => ({
                        ...prev,
                        keywordRules: prev.keywordRules.filter((_, i) => i !== idx)
                      }))
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn-ghost btn-inline"
                onClick={() =>
                  setRulesDraft((prev) => ({
                    ...prev,
                    keywordRules: [...prev.keywordRules, { keyword: "", category: "Otros" }]
                  }))
                }
              >
                + Agregar regla por palabra
              </button>

              <h3 style={{ marginTop: 14 }}>Reglas por transferencia a terceros</h3>
              {rulesDraft.transferRules.map((rule, idx) => (
                <div key={`tr-${idx}`} className="rule-row">
                  <input
                    className="rule-input"
                    value={rule.matcher || ""}
                    placeholder="Texto que va dentro de [ ] (nombre, alias, CBU…)"
                    onChange={(e) => updateTransferRule(idx, { matcher: e.target.value })}
                  />
                  <select
                    className="rule-cat"
                    value={rule.category || "Otros"}
                    onChange={(e) => updateTransferRule(idx, { category: e.target.value })}
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="rule-remove"
                    title="Quitar regla"
                    aria-label="Quitar regla"
                    onClick={() =>
                      setRulesDraft((prev) => ({
                        ...prev,
                        transferRules: prev.transferRules.filter((_, i) => i !== idx)
                      }))
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn-ghost btn-inline"
                onClick={() =>
                  setRulesDraft((prev) => ({
                    ...prev,
                    transferRules: [...prev.transferRules, { matcher: "", category: "Otros" }]
                  }))
                }
              >
                + Agregar regla de transferencia
              </button>
            </div>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="th-select">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      disabled={visibleRowsWithId.length === 0}
                      onChange={toggleSelectAllVisible}
                      title="Seleccionar movimientos visibles"
                      aria-label="Seleccionar todos los movimientos visibles"
                    />
                  </th>
                  {visibleColumns.date && renderSortableHeader("Fecha", "date")}
                  {visibleColumns.description && renderSortableHeader("Descripción", "description")}
                  {visibleColumns.category && renderSortableHeader("Categoría", "category")}
                  {visibleColumns.bank && renderSortableHeader("Banco", "bank")}
                  {visibleColumns.medium && renderSortableHeader("Medio", "medium")}
                  {visibleColumns.type && renderSortableHeader("Tipo", "type")}
                  {visibleColumns.source && renderSortableHeader("Origen", "source")}
                  {visibleColumns.amount && renderSortableHeader("Monto", "amount", "right")}
                </tr>
              </thead>
              <tbody>
                {sortedFilteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={tableColSpan} className="empty-table">
                      No hay movimientos con los filtros actuales. Probá otro mes o limpiá filtros.
                    </td>
                  </tr>
                ) : (
                  sortedFilteredExpenses.map((e, i) => {
                    const catOpts = categories.includes(e.category) ? categories : sortCategoriesList([...categories, e.category]);
                    const descExact = String(e.description || "").trim();
                    const pal = categoryPaletteIndex(e.category);
                    return (
                      <tr key={e.id || `${e.dedupeKey}-${i}`}>
                        <td className="td-select">
                          <input
                            type="checkbox"
                            checked={Boolean(e.id && selectedExpenseIds.includes(e.id))}
                            disabled={!e.id}
                            onChange={() => toggleExpenseSelected(e.id)}
                            aria-label={`Seleccionar movimiento ${e.date || ""}`}
                          />
                        </td>
                        {visibleColumns.date && (
                          <td style={{ whiteSpace: "nowrap", color: "var(--muted)" }}>{formatDateCellWithWeekday(e.date)}</td>
                        )}
                        {visibleColumns.description && <td>{e.description || "—"}</td>}
                        {visibleColumns.category && (
                          <td className="td-cat-select">
                            <select
                              className={`table-cat-select${pal === null ? "" : ` cat-palette-${pal}`}`}
                              style={categoryVisualStyle(e.category)}
                              value={e.category || "Otros"}
                              title={e.category || ""}
                              onChange={(ev) => {
                                const v = ev.target.value;
                                if (v === USE_DESCRIPTION_AS_CATEGORY) {
                                  if (!descExact) return;
                                  updateExpenseCategory(e, descExact);
                                } else {
                                  updateExpenseCategory(e, v);
                                }
                              }}
                            >
                              {catOpts.map((c) => (
                                <option key={c} value={c}>
                                  {c.length > 48 ? `${c.slice(0, 45)}…` : c}
                                </option>
                              ))}
                              <option value={USE_DESCRIPTION_AS_CATEGORY}>
                                + Usar descripción exacta como categoría nueva
                              </option>
                            </select>
                          </td>
                        )}
                        {visibleColumns.bank && <td>{e.bank || "—"}</td>}
                        {visibleColumns.medium && <td>{displayExpenseMedium(e)}</td>}
                        {visibleColumns.type && <td>{e.card_type || "—"}</td>}
                        {visibleColumns.source && (
                          <td title={e.sourceFile || ""} style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>
                            {e.sourceFile || "—"}
                          </td>
                        )}
                        {visibleColumns.amount && (
                          <td
                            style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                            className={e.amount < 0 ? "amount-neg" : "amount-pos"}
                          >
                            {e.amount < 0 ? "" : "+"}
                            {Number(e.amount || 0).toLocaleString("es-AR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            })}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="export-row">
            <button type="button" className="btn-ghost" onClick={() => exportFile("csv")}>
              Exportar CSV (vista actual)
            </button>
            <button type="button" className="btn-ghost" onClick={() => exportFile("json")}>
              Exportar JSON (vista actual)
            </button>
          </div>
        </section>
      )}

      {!loading && activeTab === "charts" && allExpenses.length === 0 && (
        <section className="panel empty-tab-hint">
          <h2 className="panel-title">Sin datos para gráficos</h2>
          <p className="empty-tab-text">Cargá movimientos desde <strong>Importar</strong> para ver tortas y rankings por mes.</p>
          <button type="button" className="btn-primary" onClick={() => setActiveTab("import")}>
            Ir a importar
          </button>
        </section>
      )}

      {!loading && activeTab === "charts" && allExpenses.length > 0 && (
        <section className="panel charts-section">
          <h2 className="panel-title">Gráficos del mes</h2>
          <p className="charts-intro">
            Solo se consideran <strong>gastos</strong> (importes negativos). Por defecto no se incluyen movimientos entre cuentas
            propias ni los débitos por <strong>pago de resumen de tarjeta</strong> (p. ej. “PAGO TARJETA MASTER”, “PAGO VISA
            ELECTRÓNICO”, textos partidos con guiones en el PDF). Más abajo hay una barra por día para ver en qué fechas concentraste
            el gasto.
          </p>
          <div className="chart-toolbar">
            <label htmlFor="chart-month" className="chart-month-label">
              Mes
            </label>
            <select
              id="chart-month"
              className="chart-month-select"
              value={chartMonth}
              onChange={(e) => setChartMonth(e.target.value)}
            >
              {monthOptions.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          {chartMonth && (
            <>
              <div className="chart-summary-cards">
                <div className="stat-card">
                  <div className="stat-label">Total gastos del mes</div>
                  <div className="stat-value negative">
                    ${chartInsights.totalGastos.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Cantidad de gastos</div>
                  <div className="stat-value muted">{chartInsights.countGastos}</div>
                </div>
              </div>

              <div className="charts-grid">
                <div className="chart-card">
                  <h3 className="chart-card-title">Gastos por categoría</h3>
                  {chartInsights.pieSlices.length === 0 ? (
                    <p className="chart-empty">No hay gastos con importe negativo en este mes.</p>
                  ) : (
                    <div className="pie-wrap">
                      <svg viewBox="0 0 200 200" className="pie-svg" aria-hidden="true">
                        {chartInsights.pieSlices.map((s) => (
                          <path
                            key={s.label}
                            d={pieSlicePath(100, 100, 88, s.a0, s.a1)}
                            fill={resolveCategoryVisual(s.label, categoryColors).bg}
                            stroke="var(--surface)"
                            strokeWidth="1"
                          />
                        ))}
                      </svg>
                      <ul className="pie-legend">
                        {chartInsights.pieSlices.map((s) => (
                          <li key={s.label} className="pie-legend-row">
                            <span
                              className="pie-legend-swatch"
                              style={{
                                background: resolveCategoryVisual(s.label, categoryColors).bg
                              }}
                            />
                            <span className="pie-legend-name">{s.label}</span>
                            <span className="pie-legend-pct">{s.pct.toFixed(1)}%</span>
                            <span className="pie-legend-amt">
                              ${s.value.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="chart-card">
                  <h3 className="chart-card-title">Mayores gastos del mes</h3>
                  {chartInsights.topGastos.length === 0 ? (
                    <p className="chart-empty">Sin datos.</p>
                  ) : (
                    <ol className="ranking-list">
                      {chartInsights.topGastos.map((e, idx) => (
                        <li key={`${e.key}-${idx}`} className="ranking-item">
                          <span className="ranking-pos">{idx + 1}</span>
                          <div className="ranking-body">
                            <div className="ranking-desc" title={e.description || ""}>
                              {e.description || "—"}
                            </div>
                            <div className="ranking-meta">
                              {e.count} movimiento(s) · {e.category || "Otros"}
                            </div>
                          </div>
                          <span className="ranking-amt">
                            $
                            {Math.abs(Number(e.total || 0)).toLocaleString("es-AR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            })}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>

              <div className="chart-card chart-card-wide">
                <h3 className="chart-card-title">Gastos por día</h3>
                {chartInsights.dailyBars.length === 0 ? (
                  <p className="chart-empty">No hay gastos con fecha reconocible en este mes.</p>
                ) : (
                  <div className="daily-bars" role="img" aria-label="Gastos acumulados por día del mes">
                    {chartInsights.dailyBars.map((row) => {
                      const h = Math.round((row.total / chartInsights.maxDay) * 100);
                      const [y, mo, d] = row.day.split("-");
                      const dt = new Date(Number(y), Number(mo) - 1, Number(d));
                      const dayLbl = Number.isNaN(dt.getTime())
                        ? row.day
                        : dt.toLocaleDateString("es-AR", { weekday: "short", day: "numeric" });
                      return (
                        <div key={row.day} className="daily-bar-col" title={`${dayLbl}: $${row.total.toLocaleString("es-AR")}`}>
                          <div className="daily-bar-track">
                            <div className="daily-bar-fill" style={{ height: `${h}%` }} />
                          </div>
                          <span className="daily-bar-label">{dayLbl}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {activeTab === "table" && allExpenses.length > 0 && selectionSummary.count > 0 && (
        <div className="selection-dock" role="status" aria-live="polite">
          <div className="selection-dock-stats">
            <strong>{selectionSummary.count}</strong> seleccionados · Suma neta:{" "}
            <strong className={selectionSummary.total < 0 ? "amount-neg" : "amount-pos"}>
              {selectionSummary.total < 0 ? "" : "+"}
              {selectionSummary.total.toLocaleString("es-AR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </strong>
            {selectionSummary.sumaGastos > 0 && (
              <span className="selection-dock-sub">
                Gastos (solo importes negativos): $
                {selectionSummary.sumaGastos.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
              </span>
            )}
          </div>
          <button type="button" className="btn-ghost btn-danger btn-inline" onClick={() => void deleteSelectedExpenses()}>
            Eliminar seleccionados
          </button>
        </div>
      )}

      {modalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Contacto no identificado</h3>
            <p>{currentUnknown}</p>
            <input value={modalName} onChange={(e) => setModalName(e.target.value)} placeholder="Nombre" />
            <select value={modalCat} onChange={(e) => setModalCat(e.target.value)}>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <div className="modal-actions">
              <button onClick={() => updateUnknown(false)}>Omitir</button>
              <button onClick={() => updateUnknown(true)}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
