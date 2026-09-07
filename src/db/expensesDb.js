import { requireUserId, supabase } from "../lib/supabaseClient";

function djb2(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

export function newExpenseId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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

export function buildStoredExpense(e, sourceFile) {
  const monthKey = e.monthKey || deriveMonthKey(e.date);
  const dedupeKey = makeDedupeKey({ ...e, sourceFile });
  return {
    id: e.id || newExpenseId(),
    dedupeKey,
    savedAt: e.savedAt || Date.now(),
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
    is_unknown: !!e.is_unknown,
    sharedWithSanti: !!e.sharedWithSanti,
    paidBy: e.paidBy === "santi" ? "santi" : "me",
    categoryManual: !!e.categoryManual
  };
}

function toRow(record, userId) {
  const savedAt = record.savedAt ? new Date(record.savedAt).toISOString() : new Date().toISOString();
  return {
    id: record.id,
    user_id: userId,
    dedupe_key: record.dedupeKey,
    saved_at: savedAt,
    source_file: record.sourceFile || "",
    date: record.date || "",
    description: record.description || "",
    raw_id: record.raw_id || "",
    category: record.category || "Otros",
    bank: record.bank || "",
    card_brand: record.card_brand ?? null,
    card_type: record.card_type ?? null,
    card_last4: record.card_last4 ?? null,
    amount: Number(record.amount) || 0,
    month_key: record.monthKey || deriveMonthKey(record.date),
    is_unknown: !!record.is_unknown,
    shared_with_santi: !!record.sharedWithSanti,
    paid_by: record.paidBy === "santi" ? "santi" : "me",
    category_manual: !!record.categoryManual
  };
}

function fromRow(row) {
  const savedMs = row.saved_at ? new Date(row.saved_at).getTime() : Date.now();
  return {
    id: row.id,
    dedupeKey: row.dedupe_key,
    savedAt: Number.isFinite(savedMs) ? savedMs : Date.now(),
    sourceFile: row.source_file || "",
    date: row.date || "",
    description: row.description || "",
    raw_id: row.raw_id || "",
    category: row.category || "Otros",
    bank: row.bank || "",
    card_brand: row.card_brand ?? null,
    card_type: row.card_type ?? null,
    card_last4: row.card_last4 ?? null,
    amount: Number(row.amount) || 0,
    monthKey: row.month_key || deriveMonthKey(row.date),
    is_unknown: !!row.is_unknown,
    sharedWithSanti: !!row.shared_with_santi,
    paidBy: row.paid_by === "santi" ? "santi" : "me",
    categoryManual: !!row.category_manual
  };
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function loadAllExpenses() {
  if (!supabase) return [];
  const pageSize = 1000;
  const all = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .order("saved_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data || [];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all.map(fromRow);
}

export async function putExpense(record) {
  const userId = await requireUserId();
  const row = toRow({ ...record, savedAt: record.savedAt ?? Date.now() }, userId);
  const { error } = await supabase.from("expenses").upsert(row, { onConflict: "id" });
  if (error) throw error;
}

export async function addExpenseIfNew(record) {
  const result = await addManyIfNew([record]);
  if (result.added[0]) return { added: true, record: result.added[0] };
  return { added: false, record: result.skipped[0] || record };
}

export async function addManyIfNew(records) {
  if (!records.length) return { added: [], skipped: [] };
  const userId = await requireUserId();
  const prepared = [];
  const seen = new Set();
  for (const r of records) {
    const rec = {
      ...r,
      id: r.id || newExpenseId(),
      dedupeKey: r.dedupeKey || makeDedupeKey({ ...r, sourceFile: r.sourceFile })
    };
    if (seen.has(rec.dedupeKey)) continue;
    seen.add(rec.dedupeKey);
    prepared.push(rec);
  }
  const existingSet = new Set();
  for (const keys of chunk(prepared.map((r) => r.dedupeKey), 120)) {
    const { data, error } = await supabase.from("expenses").select("dedupe_key").in("dedupe_key", keys);
    if (error) throw error;
    (data || []).forEach((row) => existingSet.add(row.dedupe_key));
  }
  const fresh = prepared.filter((r) => !existingSet.has(r.dedupeKey));
  const skipped = prepared.filter((r) => existingSet.has(r.dedupeKey));
  const added = [];
  for (const group of chunk(fresh, 80)) {
    const { data, error } = await supabase.from("expenses").insert(group.map((r) => toRow(r, userId))).select();
    if (error) throw error;
    added.push(...(data || []).map(fromRow));
  }
  return { added, skipped };
}

export async function clearAllExpenses() {
  const userId = await requireUserId();
  const { error } = await supabase.from("expenses").delete().eq("user_id", userId);
  if (error) throw error;
}

export async function deleteExpensesByIds(ids) {
  if (!ids.length) return;
  const { error } = await supabase.from("expenses").delete().in("id", ids);
  if (error) throw error;
}

export async function deleteExpensesBySourceFile(sourceFile) {
  const name = String(sourceFile || "").trim();
  if (!name) return;
  const { error } = await supabase.from("expenses").delete().eq("source_file", name);
  if (error) throw error;
}
