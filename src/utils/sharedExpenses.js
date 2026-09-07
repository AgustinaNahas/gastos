export const PAID_BY_ME = "me";
export const PAID_BY_SANTI = "santi";

export function paidByOf(expense) {
  return expense?.paidBy === PAID_BY_SANTI ? PAID_BY_SANTI : PAID_BY_ME;
}

export function isSantiEntry(expense) {
  return String(expense?.sourceFile || "") === "manual-santi";
}

/** Saldo a favor tuyo: Santi te debe este monto (negativo = le debés vos). */
export function santiOwesMe(expenses) {
  let balance = 0;
  for (const e of expenses || []) {
    if (!e?.sharedWithSanti) continue;
    const half = Number(e.amount || 0) / 2;
    if (paidByOf(e) === PAID_BY_ME) balance -= half;
    else balance += half;
  }
  return balance;
}

export function sharedShareAmount(expense) {
  return Number(expense?.amount || 0) / 2;
}

export function todayInputDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function inputDateToDisplay(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function formatMoneyAr(value, { sign = true, digits = 2 } = {}) {
  const n = Number(value || 0);
  const formatted = Math.abs(n).toLocaleString("es-AR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
  if (!sign) return formatted;
  if (n < 0) return `-${formatted}`;
  if (n > 0) return `+${formatted}`;
  return formatted;
}
