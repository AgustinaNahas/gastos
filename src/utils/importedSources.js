import { isSantiEntry } from "./sharedExpenses";

function deriveMonthKey(dateStr) {
  if (!dateStr) return "";
  const iso = String(dateStr).match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const slash = String(dateStr).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) return `${slash[3]}-${slash[2].padStart(2, "0")}`;
  return "";
}

/** Distingue julio/agosto cuando el archivo se llama igual (`mercado-debito.csv`). */
export function labelImportedSource(fileName, rows) {
  const base = String(fileName || "archivo").trim() || "archivo";
  const months = [
    ...new Set((rows || []).map((r) => r.monthKey || deriveMonthKey(r.date)).filter(Boolean))
  ].sort();
  if (months.length === 1) return `${base} · ${months[0]}`;
  if (months.length > 1) return `${base} · ${months[0]}–${months[months.length - 1]}`;
  return base;
}

export function attachImportedSource(fileName, rows) {
  const sourceFile = labelImportedSource(fileName, rows);
  return (rows || []).map((row) => ({ ...row, sourceFile }));
}

export function summarizeImportedSources(expenses) {
  const map = new Map();
  for (const e of expenses || []) {
    if (isSantiEntry(e)) continue;
    const key = String(e.sourceFile || "").trim() || "(sin archivo)";
    let row = map.get(key);
    if (!row) {
      row = { sourceFile: key, count: 0, banks: new Set(), months: new Set(), gastos: 0, ingresos: 0 };
      map.set(key, row);
    }
    row.count += 1;
    if (e.bank) row.banks.add(e.bank);
    const mk = e.monthKey || deriveMonthKey(e.date);
    if (mk) row.months.add(mk);
    const amt = Number(e.amount) || 0;
    if (amt < 0) row.gastos += 1;
    else if (amt > 0) row.ingresos += 1;
  }
  return [...map.values()]
    .map((r) => {
      const months = [...r.months].sort();
      return {
        sourceFile: r.sourceFile,
        count: r.count,
        bank: [...r.banks].sort().join(" · ") || "—",
        monthsLabel: months.length ? months.join(", ") : "—",
        gastos: r.gastos,
        ingresos: r.ingresos
      };
    })
    .sort((a, b) => a.sourceFile.localeCompare(b.sourceFile, "es"));
}
