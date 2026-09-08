const STOP = new Set(["de", "la", "el", "en", "y", "a", "del", "los", "las", "por", "con", "un", "una"]);

/** Recorte corto y editable para sugerir una regla por palabra clave. */
export function suggestRuleKeyword(description) {
  const t = String(description || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const cleaned = t
    .replace(/\b\d{8,}\b/g, " ")
    .replace(/\b\d+[.,]\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ").filter((w) => w && !/^[-.,;/]+$/.test(w) && !STOP.has(w.toLowerCase()));
  const picked = (words.length ? words : cleaned.split(" ")).slice(0, 4).join(" ");
  return picked.slice(0, 48);
}
