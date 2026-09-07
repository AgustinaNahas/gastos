import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  addManyIfNew,
  buildStoredExpense,
  clearAllExpenses,
  deleteExpensesByIds,
  putExpense
} from "./db/expensesDb";
import { hydrateUserCloud } from "./db/hydrateCloud";
import { saveRemoteSettings } from "./db/settingsDb";
import { isSupabaseConfigured, supabase } from "./lib/supabaseClient";
import { COLUMN_DEFS, DEFAULT_VISIBLE_COLUMNS } from "./columnConfig";
import AuthView from "./views/AuthView";
import ImportView from "./views/ImportView";
import ChartsView, { ChartsEmptyHint } from "./views/ChartsView";
import TableView, { TableEmptyHint } from "./views/TableView";
import SharedView from "./views/SharedView";
import { PAID_BY_ME, PAID_BY_SANTI, isSantiEntry } from "./utils/sharedExpenses";
import {
  applyConfiguredCategory,
  chartExpenseCategoryKey,
  isExcludedFromSpendingPatternCharts,
  categorize,
  categorizeMercadoNewExport,
  categorizeMercadoRow,
  loadCategories,
  normalizeCategory,
  normalizeText,
  reclassifyExpenseRow,
  safeCategory,
  saveCategories,
  sortCategoriesList
} from "./utils/expenseCategories";
import {
  CAT_PALETTE_COUNT,
  categoryFallbackColorIndex,
  loadCategoryColors,
  parseHexColor,
  paletteSwatchIndexForCategory,
  resolveCategoryVisual,
  saveCategoryColors
} from "./utils/categoryVisual";
import { buildPieSlices } from "./utils/chartPie";
import {
  inferCardBrand,
  parseCreditPdfGeneric,
  parseGaliciaDebitoPdf,
  parseMoney,
  parsePatagoniaDebito
} from "./parsers/statements";

const STORAGE_KEY = "gastos_kb_v2";
const COLUMN_PREFS_KEY = "gastos_visible_columns_v1";
const AUTO_RULES_KEY = "gastos_auto_category_rules_v1";
GlobalWorkerOptions.workerSrc = pdfWorker;

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

function monthKeysToOptions(keys) {
  return [...new Set((keys || []).filter(Boolean))].sort().reverse().map((k) => {
    const [y, m] = k.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    let label = d.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
    label = label.charAt(0).toUpperCase() + label.slice(1);
    return { value: k, label };
  });
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

function stripMercadoCsvQuotes(value) {
  return String(value || "")
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/""/g, '"')
    .trim();
}

function buildMercadoDescription(row) {
  const sale = stripMercadoCsvQuotes(row.SALE_DETAIL);
  const store = stripMercadoCsvQuotes(row.STORE_NAME);
  const txn = String(row.TRANSACTION_TYPE || "MOVIMIENTO").trim();
  const pm = mercadoPaymentLabel(row.PAYMENT_METHOD_TYPE);
  const usefulSale = sale && !/^varios$/i.test(sale) ? sale : "";
  const label = usefulSale || store || txn;
  const parts = [label];
  if (pm && label !== pm) parts.push(pm);
  if (row.SUB_UNIT) parts.push(String(row.SUB_UNIT).trim());
  if (row.BUSINESS_UNIT) parts.push(String(row.BUSINESS_UNIT).trim());
  if (usefulSale && txn && txn !== "SETTLEMENT" && !usefulSale.toLowerCase().includes(txn.toLowerCase())) {
    parts.push(txn);
  }
  return parts.filter(Boolean).join(" · ");
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
  const [sessionUser, setSessionUser] = useState(undefined);
  const [cloudReady, setCloudReady] = useState(false);
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
      if (t === "table" || t === "import" || t === "charts" || t === "shared") return t;
    } catch {
      /* ignore */
    }
    return "table";
  });
  const [chartMonth, setChartMonth] = useState("");
  const [chartPieGranularity, setChartPieGranularity] = useState(() => {
    try {
      const g = sessionStorage.getItem("gastos_chart_pie_granularity_v1");
      if (g === "categories" || g === "subcategories") return g;
    } catch {
      /* ignore */
    }
    return "subcategories";
  });
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
  const [sharedMonth, setSharedMonth] = useState("");

  const categoryPaletteIndex = (catName) => paletteSwatchIndexForCategory(catName, categoryColors);
  const categoryVisualStyle = (catName) => {
    const { bg, fg } = resolveCategoryVisual(catName, categoryColors);
    return { backgroundColor: bg, color: fg };
  };

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) {
      setSessionUser(null);
      return undefined;
    }
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setSessionUser(data.session?.user ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUser(session?.user ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!sessionUser) {
      setCloudReady(false);
      setAllExpenses([]);
      setSelectedExpenseIds([]);
      return undefined;
    }
    let cancelled = false;
    setCloudReady(false);
    (async () => {
      try {
        const { settings, expenses } = await hydrateUserCloud(sessionUser.id, { normalizeStoredMedium });
        if (cancelled) return;
        setKnowledgeBase(settings.knowledgeBase);
        saveKB(settings.knowledgeBase);
        setVisibleColumns(settings.visibleColumns);
        setAutoCategoryRules(cloneRules(settings.autoRules));
        setRulesDraft(cloneRules(settings.autoRules));
        setCategoryOptions(sortCategoriesList(settings.categories));
        setCategoryColors(settings.categoryColors);
        setCategoryOptions((prev) => {
          const fromRows = [...new Set(expenses.map((r) => r.category).filter(Boolean))];
          return sortCategoriesList([...prev, ...fromRows]);
        });
        setAllExpenses(expenses);
        setCloudReady(true);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          alert(`No se pudieron cargar los gastos: ${e.message}`);
          setCloudReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionUser?.id]);

  useEffect(() => {
    if (!sessionUser || !cloudReady) return undefined;
    const t = setTimeout(() => {
      void saveRemoteSettings({
        knowledgeBase,
        categories: categoryOptions,
        categoryColors,
        autoRules: autoCategoryRules,
        visibleColumns
      }).catch((err) => console.error(err));
    }, 800);
    return () => clearTimeout(t);
  }, [sessionUser, cloudReady, knowledgeBase, categoryOptions, categoryColors, autoCategoryRules, visibleColumns]);

  useEffect(() => {
    try {
      sessionStorage.setItem("gastos_active_tab_v1", activeTab);
    } catch {
      /* ignore */
    }
  }, [activeTab]);

  useEffect(() => {
    try {
      sessionStorage.setItem("gastos_chart_pie_granularity_v1", chartPieGranularity);
    } catch {
      /* ignore */
    }
  }, [chartPieGranularity]);

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

  const personalExpenses = useMemo(() => allExpenses.filter((e) => !isSantiEntry(e)), [allExpenses]);
  const sharedExpenses = useMemo(() => allExpenses.filter((e) => e.sharedWithSanti), [allExpenses]);

  const filteredExpenses = useMemo(
    () =>
      personalExpenses.filter(
        (e) =>
          (!filters.month || e.monthKey === filters.month) &&
          (!filters.cat || e.category === filters.cat) &&
          (!filters.bank || e.bank === filters.bank) &&
          (!filters.card || e.card_brand === filters.card) &&
          (!filters.type || e.card_type === filters.type) &&
          (!filters.flow || (filters.flow === "in" ? Number(e.amount) > 0 : Number(e.amount) < 0)) &&
          (!filters.excludeinterAccount || !isInterAccountMovement(e))
      ),
    [personalExpenses, filters]
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
    () => [...new Set(personalExpenses.map((e) => e.bank).filter(Boolean))].sort(),
    [personalExpenses]
  );
  const cards = useMemo(
    () => [...new Set(personalExpenses.map((e) => e.card_brand).filter(Boolean))].sort(),
    [personalExpenses]
  );
  const categories = useMemo(
    () => sortCategoriesList([...categoryOptions, ...allExpenses.map((e) => e.category).filter(Boolean)]),
    [allExpenses, categoryOptions]
  );
  const rootCategories = useMemo(() => {
    const base = categories.filter((c) => !String(c).includes(" / "));
    return base.length ? base : ["Otros"];
  }, [categories]);

  const monthOptions = useMemo(
    () => monthKeysToOptions(personalExpenses.map((e) => e.monthKey)),
    [personalExpenses]
  );
  const sharedMonthOptions = useMemo(
    () => monthKeysToOptions(sharedExpenses.map((e) => e.monthKey)),
    [sharedExpenses]
  );

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
    if (sharedMonthOptions.length === 0) return;
    if (sharedMonth && !sharedMonthOptions.some((m) => m.value === sharedMonth)) {
      setSharedMonth(sharedMonthOptions[0].value);
    }
  }, [sharedMonthOptions, sharedMonth]);

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
        maxDay: 1,
        weekdayBars: [],
        maxWeekday: 1
      };
    }
    const inMonth = personalExpenses.filter(
      (e) => e.monthKey === month && !isInterAccountMovement(e) && !isCardBillPayment(e)
    );
    const gastos = inMonth.filter((e) => Number(e.amount) < 0);
    const totalGastos = gastos.reduce((s, e) => s + Math.abs(Number(e.amount || 0)), 0);
    const byCat = {};
    gastos.forEach((e) => {
      const c = chartExpenseCategoryKey(e.category, chartPieGranularity);
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
    const gastosPattern = gastos.filter((e) => !isExcludedFromSpendingPatternCharts(e.category));
    const byDay = {};
    const dailyExpenseLines = {};
    gastosPattern.forEach((e) => {
      const dk = expenseDayKey(e.date);
      if (!dk) return;
      const amt = Math.abs(Number(e.amount || 0));
      byDay[dk] = (byDay[dk] || 0) + amt;
      if (!dailyExpenseLines[dk]) dailyExpenseLines[dk] = [];
      dailyExpenseLines[dk].push({
        description: String(e.description || "").trim() || "—",
        amount: amt,
        category: e.category || "Otros"
      });
    });
    const dayKeys = Object.keys(byDay).sort();
    const dailyBars = dayKeys.map((k) => {
      const expenses = [...(dailyExpenseLines[k] || [])].sort((a, b) => b.amount - a.amount);
      return { day: k, total: byDay[k], expenses };
    });
    const maxDay = dailyBars.length ? Math.max(...dailyBars.map((d) => d.total), 1) : 1;

    const byWeekday = [0, 0, 0, 0, 0, 0, 0];
    const weekdayExpenseLines = [[], [], [], [], [], [], []];
    gastosPattern.forEach((e) => {
      const d = dateStringToLocalDate(e.date);
      if (!d) return;
      const wd = d.getDay();
      const amt = Math.abs(Number(e.amount || 0));
      byWeekday[wd] += amt;
      weekdayExpenseLines[wd].push({
        description: String(e.description || "").trim() || "—",
        amount: amt,
        category: e.category || "Otros",
        date: e.date || ""
      });
    });
    const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];
    const refMonday = new Date(2024, 0, 1);
    const weekdayBars = weekdayOrder.map((wd, slot) => {
      const ref = new Date(refMonday);
      ref.setDate(refMonday.getDate() + slot);
      const expenses = [...weekdayExpenseLines[wd]].sort((a, b) => b.amount - a.amount);
      return {
        dow: wd,
        label: ref.toLocaleDateString("es-AR", { weekday: "short" }),
        total: byWeekday[wd],
        expenses
      };
    });
    const maxWeekday = weekdayBars.length ? Math.max(...weekdayBars.map((w) => w.total), 1) : 1;
    return {
      totalGastos,
      countGastos: gastos.length,
      pieSlices,
      topGastos,
      dailyBars,
      maxDay,
      weekdayBars,
      maxWeekday
    };
  }, [personalExpenses, chartMonth, chartPieGranularity]);

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
          const ext = (f.name.split(".").pop() || "").toLowerCase();
          if (ext === "pdf") {
            parsedExpenses.push(...parseGaliciaDebitoPdf(content).map((row) => ({ ...row, sourceFile })));
          } else {
            const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
            parsedExpenses.push(...parseGaliciaDebitoWorkbook(wb).map((row) => ({ ...row, sourceFile })));
          }
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
        const { added, skipped } = await addManyIfNew(records);
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
            `Se cargaron ${gastosNuevos} gastos nuevos${ingresosNuevos ? ` y ${ingresosNuevos} ingresos` : ""} (${added.length} movimientos en total). Quedan guardados en tu cuenta.`
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
        "¿Borrar todos los gastos guardados en tu cuenta? Se eliminan de Supabase y no se puede deshacer."
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
  const tableColSpan = visibleColumnCount + 2;
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

  function persistExpensePatch(ids, patchFn) {
    const idSet = new Set((ids || []).filter(Boolean));
    if (!idSet.size) return;
    setAllExpenses((prev) => {
      const next = prev.map((row) => (row.id && idSet.has(row.id) ? patchFn(row) : row));
      const ts = Date.now();
      const toSave = next.filter((row, i) => row.id && idSet.has(row.id) && row !== prev[i]).map((row) => ({ ...row, savedAt: ts }));
      if (toSave.length > 0) {
        void Promise.all(toSave.map((e) => putExpense(e))).catch(() => {});
      }
      return next.map((row) => (row.id && idSet.has(row.id) ? { ...row, savedAt: ts } : row));
    });
  }

  function setExpensesShared(ids, shared) {
    persistExpensePatch(ids, (e) => ({
      ...e,
      sharedWithSanti: Boolean(shared),
      paidBy: e.paidBy === PAID_BY_SANTI ? PAID_BY_SANTI : PAID_BY_ME
    }));
  }

  function toggleExpenseShared(expense) {
    if (!expense?.id) return;
    setExpensesShared([expense.id], !expense.sharedWithSanti);
  }

  function setExpensePaidBy(id, paidBy) {
    const nextPaid = paidBy === PAID_BY_SANTI ? PAID_BY_SANTI : PAID_BY_ME;
    persistExpensePatch([id], (e) => ({ ...e, paidBy: nextPaid, sharedWithSanti: true }));
  }

  async function addSantiManualExpense({ date, description, amount, category }) {
    const cat = normalizeCategory(String(category || "").trim() || "Otros");
    setCategoryOptions((prev) => (prev.includes(cat) ? prev : sortCategoriesList([...prev, cat])));
    setCategoryColors((prev) => (prev[cat] !== undefined ? prev : { ...prev, [cat]: categoryFallbackColorIndex(cat) }));
    const rec = buildStoredExpense(
      {
        date,
        description,
        amount,
        category: cat,
        bank: "Santi",
        card_brand: "Cuenta",
        card_type: "Manual",
        raw_id: `santi-${Date.now()}`,
        sharedWithSanti: true,
        paidBy: PAID_BY_SANTI,
        is_unknown: false
      },
      "manual-santi"
    );
    await putExpense(rec);
    setAllExpenses((prev) => [rec, ...prev]);
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
        <div className="app-header-row">
          <div>
            <h1>Mis gastos del mes</h1>
            <p>Resúmenes Patagonia, Galicia y Mercado Pago · Guardados en la nube</p>
          </div>
          {sessionUser && (
            <div className="app-header-user">
              <span className="app-header-email">{sessionUser.email}</span>
              <button
                type="button"
                className="btn-ghost btn-inline"
                onClick={() => {
                  void supabase?.auth.signOut();
                }}
              >
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </header>

      {sessionUser === undefined || (sessionUser && !cloudReady) ? (
        <div className="loading-block panel">
          <div className="loading-spinner" aria-hidden="true" />
          <div className="loading-text">{sessionUser ? "Cargando tus gastos..." : "Entrando..."}</div>
        </div>
      ) : !sessionUser ? (
        <AuthView />
      ) : (
        <>
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
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "shared"}
          className={`app-tab${activeTab === "shared" ? " app-tab-active" : ""}`}
          onClick={() => setActiveTab("shared")}
        >
          Con Santi
        </button>
      </nav>

      {!loading && activeTab === "import" && (
        <ImportView
          fileInputRef={fileInputRef}
          uploadDragging={uploadDragging}
          setUploadDragging={setUploadDragging}
          uploadedFiles={uploadedFiles}
          addFiles={addFiles}
          removeFile={removeFile}
          fileTypeTag={fileTypeTag}
          startAnalysis={startAnalysis}
          clearImportQueue={clearImportQueue}
          clearStoredExpenses={clearStoredExpenses}
          analysisMessage={analysisMessage}
          hasStoredExpenses={allExpenses.length > 0}
        />
      )}

      {loading && (
        <div className="loading-block panel">
          <div className="loading-spinner" aria-hidden="true" />
          <div className="loading-text">{loadingText}</div>
        </div>
      )}

      {!loading && activeTab === "table" && personalExpenses.length === 0 && (
        <TableEmptyHint onGoImport={() => setActiveTab("import")} />
      )}

      {!loading && activeTab === "table" && personalExpenses.length > 0 && (
        <TableView
          stats={stats}
          filters={filters}
          setFilters={setFilters}
          monthOptions={monthOptions}
          banks={banks}
          cards={cards}
          categories={categories}
          rootCategories={rootCategories}
          categoryOptions={categoryOptions}
          showColumnConfig={showColumnConfig}
          setShowColumnConfig={setShowColumnConfig}
          visibleColumns={visibleColumns}
          toggleColumn={toggleColumn}
          showRulesConfig={showRulesConfig}
          setShowRulesConfig={setShowRulesConfig}
          rulesDraft={rulesDraft}
          setRulesDraft={setRulesDraft}
          commitRulesDraft={commitRulesDraft}
          updateKeywordRule={updateKeywordRule}
          updateTransferRule={updateTransferRule}
          newCategoryName={newCategoryName}
          setNewCategoryName={setNewCategoryName}
          addCategory={addCategory}
          newSubcategoryName={newSubcategoryName}
          setNewSubcategoryName={setNewSubcategoryName}
          subcategoryParent={subcategoryParent}
          setSubcategoryParent={setSubcategoryParent}
          addSubcategory={addSubcategory}
          categoryPaletteIndex={categoryPaletteIndex}
          categoryVisualStyle={categoryVisualStyle}
          categoryColors={categoryColors}
          openColorPickerFor={openColorPickerFor}
          setOpenColorPickerFor={setOpenColorPickerFor}
          setCategoryColor={setCategoryColor}
          setCategoryHexColor={setCategoryHexColor}
          removeCategory={removeCategory}
          sortedFilteredExpenses={sortedFilteredExpenses}
          renderSortableHeader={renderSortableHeader}
          tableColSpan={tableColSpan}
          selectedExpenseIds={selectedExpenseIds}
          toggleExpenseSelected={toggleExpenseSelected}
          toggleSelectAllVisible={toggleSelectAllVisible}
          allVisibleSelected={allVisibleSelected}
          visibleRowsWithId={visibleRowsWithId}
          updateExpenseCategory={updateExpenseCategory}
          formatDateCellWithWeekday={formatDateCellWithWeekday}
          displayExpenseMedium={displayExpenseMedium}
          exportFile={exportFile}
          toggleExpenseShared={toggleExpenseShared}
        />
      )}

      {!loading && activeTab === "charts" && personalExpenses.length === 0 && (
        <ChartsEmptyHint onGoImport={() => setActiveTab("import")} />
      )}

      {!loading && activeTab === "charts" && personalExpenses.length > 0 && (
        <ChartsView
          chartMonth={chartMonth}
          setChartMonth={setChartMonth}
          monthOptions={monthOptions}
          chartInsights={chartInsights}
          categoryColors={categoryColors}
          chartPieGranularity={chartPieGranularity}
          setChartPieGranularity={setChartPieGranularity}
        />
      )}

      {!loading && activeTab === "shared" && (
        <SharedView
          expenses={sharedExpenses}
          monthOptions={sharedMonthOptions}
          sharedMonth={sharedMonth}
          setSharedMonth={setSharedMonth}
          categories={categories}
          formatDateCellWithWeekday={formatDateCellWithWeekday}
          onAddSantiExpense={addSantiManualExpense}
          onSetPaidBy={setExpensePaidBy}
          onUnshare={(id) => setExpensesShared([id], false)}
          onDelete={(id) => {
            if (!id) return;
            if (!confirm("¿Borrar este gasto de Santi?")) return;
            void deleteExpensesByIds([id])
              .then(() => {
                setAllExpenses((prev) => prev.filter((e) => e.id !== id));
                setSelectedExpenseIds((prev) => prev.filter((x) => x !== id));
              })
              .catch((err) => alert(`No se pudo eliminar: ${err.message}`));
          }}
        />
      )}

      {activeTab === "table" && personalExpenses.length > 0 && selectionSummary.count > 0 && (
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
          <div className="selection-dock-actions">
            <button
              type="button"
              className="btn-ghost btn-inline"
              onClick={() => setExpensesShared(selectionSummary.list.map((e) => e.id), true)}
            >
              Compartir con Santi
            </button>
            <button
              type="button"
              className="btn-ghost btn-inline"
              onClick={() => setExpensesShared(selectionSummary.list.map((e) => e.id), false)}
            >
              Dejar de compartir
            </button>
            <button type="button" className="btn-ghost btn-danger btn-inline" onClick={() => void deleteSelectedExpenses()}>
              Eliminar seleccionados
            </button>
          </div>
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
        </>
      )}
    </div>
  );
}

export default App;
