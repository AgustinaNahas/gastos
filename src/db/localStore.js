import { openDB } from "idb";

const DB_NAME = "gastos-app";
const DB_VERSION = 1;
const STORE = "expenses";

async function getLocalDb() {
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

/** Lectura de lo que quedó en este navegador (IndexedDB) para migrar a Supabase. */
export async function loadLocalExpenses() {
  try {
    const db = await getLocalDb();
    const rows = await db.getAll(STORE);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export function loadLocalSettings() {
  const read = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };
  return {
    knowledgeBase: read("gastos_kb_v2", {}),
    categories: read("gastos_categories_v1", []),
    categoryColors: read("gastos_category_colors_v1", {}),
    autoRules: read("gastos_auto_category_rules_v1", { keywordRules: [], transferRules: [] }),
    visibleColumns: read("gastos_visible_columns_v1", {})
  };
}
