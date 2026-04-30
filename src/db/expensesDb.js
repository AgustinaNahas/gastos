import { openDB } from "idb";

const DB_NAME = "gastos-app";
const DB_VERSION = 1;
const STORE = "expenses";

function djb2(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

/** UUID v4; fallback si no hay Web Crypto (HTTP no seguro, navegadores viejos). */
function newExpenseId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Clave estable para no duplicar la misma fila al reimportar el mismo archivo.
 * Incluye archivo fuente, fecha, monto, descripción normalizada, banco, tipo y raw_id (p. ej. SOURCE_ID MP).
 */
export function makeDedupeKey(partial) {
  const norm = String(partial.description || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const src = String(partial.sourceFile || "unknown");
  const amt = Number(partial.amount);
  const rounded = Number.isFinite(amt) ? Math.round(amt * 100) / 100 : 0;
  const payload = [
    src,
    partial.date || "",
    String(rounded),
    norm,
    partial.bank || "",
    partial.card_type || "",
    String(partial.raw_id || "")
  ].join("|");
  return `d${djb2(payload)}`;
}

function deriveMonthKey(dateStr) {
  if (!dateStr) return "";
  const iso = String(dateStr).match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const slash = String(dateStr).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) return `${slash[3]}-${slash[2].padStart(2, "0")}`;
  return "";
}

/**
 * @param {object} e - fila parseada (sin id ni dedupeKey obligatorios)
 * @param {string} sourceFile - nombre del archivo importado
 */
export function buildStoredExpense(e, sourceFile) {
  const monthKey = e.monthKey || deriveMonthKey(e.date);
  const dedupeKey = makeDedupeKey({ ...e, sourceFile });
  return {
    id: newExpenseId(),
    dedupeKey,
    savedAt: Date.now(),
    sourceFile: sourceFile || "",
    date: e.date ?? "",
    description: e.description ?? "",
    raw_id: e.raw_id ?? "",
    category: e.category ?? "Otros",
    bank: e.bank ?? "",
    card_brand: e.card_brand ?? null,
    card_type: e.card_type ?? null,
    card_last4: e.card_last4 ?? null,
    amount: typeof e.amount === "number" ? e.amount : Number(e.amount) || 0,
    monthKey,
    is_unknown: !!e.is_unknown
  };
}

export async function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("byDedupe", "dedupeKey", { unique: true });
        store.createIndex("monthKey", "monthKey");
        store.createIndex("savedAt", "savedAt");
      }
    }
  });
}

export async function loadAllExpenses() {
  const db = await getDb();
  const rows = await db.getAll(STORE);
  rows.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  return rows;
}

export async function putExpense(record) {
  const db = await getDb();
  await db.put(STORE, { ...record, savedAt: record.savedAt ?? Date.now() });
}

export async function addExpenseIfNew(record) {
  const db = await getDb();
  const existing = await db.getFromIndex(STORE, "byDedupe", record.dedupeKey);
  if (existing) return { added: false, record: existing };
  await db.add(STORE, record);
  return { added: true, record };
}

export async function clearAllExpenses() {
  const db = await getDb();
  await db.clear(STORE);
}

/** @param {string[]} ids */
export async function deleteExpensesByIds(ids) {
  if (!ids.length) return;
  const db = await getDb();
  const tx = db.transaction(STORE, "readwrite");
  await Promise.all(ids.map((id) => tx.store.delete(id)));
  await tx.done;
}
