import { DEFAULT_VISIBLE_COLUMNS } from "../columnConfig";
import { DEFAULT_CATEGORIES, sortCategoriesList } from "../utils/expenseCategories";
import { addManyIfNew, loadAllExpenses, putExpense } from "./expensesDb";
import { loadLocalExpenses, loadLocalSettings } from "./localStore";
import { loadRemoteSettings, saveRemoteSettings } from "./settingsDb";

const DEFAULT_AUTO_RULES = { keywordRules: [], transferRules: [] };

function mergeVisibleColumns(cols) {
  return { ...DEFAULT_VISIBLE_COLUMNS, ...(cols && typeof cols === "object" ? cols : {}) };
}

function normalizeAutoRules(rules) {
  if (!rules || typeof rules !== "object") return { ...DEFAULT_AUTO_RULES };
  return {
    keywordRules: Array.isArray(rules.keywordRules) ? rules.keywordRules : [],
    transferRules: Array.isArray(rules.transferRules) ? rules.transferRules : []
  };
}

function migrationFlag(userId) {
  return `gastos_cloud_migrated_${userId}`;
}

/**
 * Carga settings + gastos de Supabase. Si es la primera vez de este usuario en este
 * navegador, sube lo que hubiera en IndexedDB / localStorage.
 */
export async function hydrateUserCloud(userId, { normalizeStoredMedium }) {
  let settings = await loadRemoteSettings();
  const local = loadLocalSettings();

  if (!settings) {
    const categories =
      Array.isArray(local.categories) && local.categories.length
        ? sortCategoriesList(local.categories)
        : [...DEFAULT_CATEGORIES];
    settings = {
      knowledgeBase: local.knowledgeBase && typeof local.knowledgeBase === "object" ? local.knowledgeBase : {},
      categories,
      categoryColors: local.categoryColors && typeof local.categoryColors === "object" ? local.categoryColors : {},
      autoRules: normalizeAutoRules(local.autoRules),
      visibleColumns: mergeVisibleColumns(local.visibleColumns)
    };
    await saveRemoteSettings(settings);
  } else {
    settings = {
      knowledgeBase: settings.knowledgeBase && typeof settings.knowledgeBase === "object" ? settings.knowledgeBase : {},
      categories:
        Array.isArray(settings.categories) && settings.categories.length
          ? sortCategoriesList(settings.categories)
          : [...DEFAULT_CATEGORIES],
      categoryColors: settings.categoryColors && typeof settings.categoryColors === "object" ? settings.categoryColors : {},
      autoRules: normalizeAutoRules(settings.autoRules),
      visibleColumns: mergeVisibleColumns(settings.visibleColumns)
    };
  }

  const flag = migrationFlag(userId);
  let alreadyMigrated = false;
  try {
    alreadyMigrated = Boolean(localStorage.getItem(flag));
  } catch {
    alreadyMigrated = false;
  }

  if (!alreadyMigrated) {
    const localRows = await loadLocalExpenses();
    if (localRows.length) {
      await addManyIfNew(
        localRows.map((r) => ({
          ...r,
          savedAt: r.savedAt || Date.now(),
          paidBy: r.paidBy === "santi" ? "santi" : "me",
          sharedWithSanti: !!r.sharedWithSanti,
          categoryManual: !!r.categoryManual
        }))
      );
    }
    try {
      localStorage.setItem(flag, "1");
    } catch {
      /* ignore */
    }
  }

  const rows = await loadAllExpenses();
  const next = rows.map((row) => normalizeStoredMedium(row));
  const toSave = next.filter(
    (e, i) => e.id && (e.card_brand !== rows[i].card_brand || e.card_last4 !== rows[i].card_last4)
  );
  if (toSave.length > 0) {
    const ts = Date.now();
    await Promise.all(toSave.map((e) => putExpense({ ...e, savedAt: ts }))).catch(() => {});
  }

  return { settings, expenses: next };
}
