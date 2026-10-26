import { categorize, categorizeMercadoNewExport } from "../utils/expenseCategories.js";

const MONTH_ABBR = {
  ene: "01",
  jan: "01",
  feb: "02",
  mar: "03",
  abr: "04",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  ago: "08",
  aug: "08",
  sep: "09",
  set: "09",
  oct: "10",
  nov: "11",
  dic: "12",
  dec: "12"
};

const CREDIT_ROW_RE =
  /^(\d{2}[./-]\d{2}[./-]\d{2,4}|\d{2}-[A-Za-záéíóúÁÉÍÓÚ]{3}-\d{2,4})\s+(.+?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2}-?)$/i;
const GALICIA_DEBITO_DATE_RE = /^(\d{2}\/\d{2}\/\d{2})(?!\d)(?:\s+(.*))?$/;
const MONEY_RE = /-?\d{1,3}(?:\.\d{3})*,\d{2}-?/g;

export function parseMoney(value) {
  if (!value) return 0;
  const cleaned = String(value).replace(/\$/g, "").replace(/\./g, "").replace(",", ".").replace(/\s+/g, "").trim();
  if (!cleaned) return 0;
  const negative = cleaned.startsWith("-") || cleaned.endsWith("-");
  const numeric = parseFloat(cleaned.replace(/-/g, ""));
  if (Number.isNaN(numeric)) return 0;
  return negative ? -numeric : numeric;
}

export function normalizeDate(dateText) {
  if (!dateText) return "";
  const raw = String(dateText).trim();
  const named = raw.match(/^(\d{1,2})-([A-Za-záéíóúÁÉÍÓÚ]{3})-(\d{2,4})$/);
  if (named) {
    const mm = MONTH_ABBR[named[2].toLowerCase()];
    if (!mm) return raw;
    const yy = named[3].length === 2 ? `20${named[3]}` : named[3];
    return `${named[1].padStart(2, "0")}/${mm}/${yy}`;
  }
  if (raw.includes(".")) {
    const [dd, mm, yy] = raw.split(".");
    if (dd && mm && yy) return `${dd}/${mm}/${yy.length === 2 ? `20${yy}` : yy}`;
  }
  const dashed = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (dashed) {
    const yy = dashed[3].length === 2 ? `20${dashed[3]}` : dashed[3];
    return `${dashed[1].padStart(2, "0")}/${dashed[2].padStart(2, "0")}/${yy}`;
  }
  const slashed = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashed) {
    const yy = slashed[3].length === 2 ? `20${slashed[3]}` : slashed[3];
    return `${slashed[1].padStart(2, "0")}/${slashed[2].padStart(2, "0")}/${yy}`;
  }
  return raw;
}

export function inferCardBrand(description) {
  const d = String(description || "").toLowerCase();
  if (d.includes("visa")) return "Visa";
  if (d.includes("master") || d.includes("maestro")) return "Mastercard";
  const pan = String(description || "").match(/\b([2-6]\d{12,18})\b/);
  if (pan) {
    const d0 = pan[1][0];
    if (d0 === "4") return "Visa";
    if (d0 === "5" || d0 === "2") return "Mastercard";
  }
  return null;
}

function isGaliciaDebitoNoise(line) {
  const l = String(line || "").toLowerCase();
  if (/^fecha\s+descripci/.test(l)) return true;
  if (/^resumen de cuenta/.test(l)) return true;
  if (/^movimientos$/.test(l)) return true;
  if (/^página(\s+\d|$)/.test(l)) return true;
  if (/^\d{14,}x$/i.test(line)) return true;
  return false;
}

/** Fin del listado de movimientos: totales y pie legal del resumen. */
function isGaliciaDebitoEndOfMovements(line) {
  const l = String(line || "").toLowerCase().trim();
  if (/^total\b/.test(l)) return true;
  if (/^los dep[oó]sitos\b/.test(l)) return true;
  if (/^los totales mensuales\b/.test(l)) return true;
  if (/^al completa\b/.test(l)) return true;
  if (/^canales de atenci/.test(l)) return true;
  return false;
}

function toGaliciaDebitoExpense(entry) {
  const description = String(entry.description || "").replace(/\s+/g, " ").trim();
  return {
    date: normalizeDate(entry.date),
    description,
    raw_id: "",
    category: categorize(description),
    bank: "Galicia",
    card_brand: inferCardBrand(description) || "Cuenta",
    card_type: "Débito",
    card_last4: null,
    amount: entry.amount,
    is_unknown: /transferencia a terceros|debin/i.test(description)
  };
}

function extractGaliciaDebitoMovement(line) {
  const amounts = String(line || "").match(MONEY_RE) || [];
  if (!amounts.length) return null;
  const movementToken = amounts.length >= 2 ? amounts[amounts.length - 2] : amounts[0];
  return parseMoney(movementToken);
}

export function parseGaliciaDebitoPdf(text) {
  const lines = String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const expenses = [];
  let current = null;

  const flush = () => {
    if (current && current.amount !== null && current.amount !== undefined) {
      expenses.push(toGaliciaDebitoExpense(current));
    }
    current = null;
  };

  for (const line of lines) {
    if (isGaliciaDebitoEndOfMovements(line)) {
      flush();
      break;
    }
    if (isGaliciaDebitoNoise(line)) continue;
    const dateMatch = line.match(GALICIA_DEBITO_DATE_RE);
    if (dateMatch) {
      flush();
      const rest = dateMatch[2] || "";
      const movement = extractGaliciaDebitoMovement(rest);
      let desc = rest;
      const amountTokens = rest.match(MONEY_RE) || [];
      for (const token of amountTokens) desc = desc.replace(token, " ");
      desc = desc.replace(/\b\d{4}\b/g, " ").replace(/\s+/g, " ").trim();
      current = {
        date: dateMatch[1],
        description: desc,
        amount: movement
      };
      continue;
    }
    if (!current) continue;
    if (current.amount === null || current.amount === undefined) {
      const movement = extractGaliciaDebitoMovement(line);
      if (movement !== null && !line.startsWith("$")) {
        current.amount = movement;
        continue;
      }
    }
    if (/^\d{13,19}$/.test(line)) {
      current.description = `${current.description} ${line}`.trim();
      continue;
    }
    current.description = `${current.description} ${line}`.trim();
  }
  flush();
  return expenses;
}

export function parsePatagoniaDebito(text) {
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
    card_brand: e.description.toLowerCase().includes("visa")
      ? "Visa"
      : e.description.toLowerCase().includes("master")
        ? "Mastercard"
        : null,
    card_type: e.description.toLowerCase().includes("tarjeta credito") ? "Crédito" : "Débito",
    card_last4: null,
    amount: e.amount,
    is_unknown: false
  }));
}

export function parseCreditPdfGeneric(text, bank, cardBrand) {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/[_\s]+$/g, "").trim())
    .filter(Boolean);
  const expenses = [];
  for (const line of lines) {
    const m = line.match(CREDIT_ROW_RE);
    if (!m) continue;
    const description = m[2].trim();
    if (/\bsaldo anterior\b/i.test(description) || /\bsu pago\b/i.test(description)) continue;
    const amount = parseMoney(m[3]);
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

export function textLooksLikeMercadoNewExport(text) {
  const t = String(text).slice(0, 4000);
  return t.includes("RELEASE_DATE") && t.includes("TRANSACTION_NET_AMOUNT") && t.includes("REFERENCE_ID");
}

/**
 * CSV actual de Mercado Pago: saldos + RELEASE_DATE;TRANSACTION_TYPE;REFERENCE_ID;…
 * Deja el comercio / contraparte como descripción y el tipo en card_brand.
 */
export function interpretMercadoNewType(rawType) {
  const t = String(rawType || "").replace(/\s+/g, " ").trim();
  const lower = t.toLowerCase();

  const qr = t.match(/^pago con qr\s+(.+)$/i);
  if (qr) {
    const merchant = qr[1].trim();
    return { description: merchant, medium: "QR", internal: false };
  }

  const pago = t.match(/^pago\s+(.+)$/i);
  if (pago && pago[1].trim()) {
    return { description: pago[1].trim(), medium: "Pago", internal: false };
  }
  if (/^pago$/i.test(t)) return { description: "Pago", medium: "Pago", internal: false };

  const sent = t.match(/^transferencia enviada\s+(.+)$/i);
  if (sent) return { description: sent[1].trim(), medium: "Enviada", internal: false };
  const recv = t.match(/^transferencia recibida\s+(.+)$/i);
  if (recv) return { description: recv[1].trim(), medium: "Recibida", internal: false };

  const reservaGastos = t.match(/^reserva por gastos\s*(.*)$/i);
  if (reservaGastos) {
    const pocket = reservaGastos[1].trim() || "bolsa";
    return { description: `Reserva · ${pocket}`, medium: "Bolsa", internal: true };
  }
  const reservado = t.match(/^dinero reservado\s*(.*)$/i);
  if (reservado) {
    const pocket = reservado[1].trim() || "bolsa";
    return { description: `Reserva · ${pocket}`, medium: "Bolsa", internal: true };
  }
  const retirado = t.match(/^dinero retirado\s*(.*)$/i);
  if (retirado) {
    const pocket = retirado[1].trim() || "bolsa";
    return { description: `Retiro bolsa · ${pocket}`, medium: "Bolsa", internal: true };
  }

  if (lower.startsWith("ingreso de dinero")) {
    return { description: "Ingreso a Mercado Pago", medium: "Ingreso", internal: true };
  }
  if (lower.startsWith("rendimientos")) {
    return { description: "Rendimientos", medium: "Rendimientos", internal: false };
  }
  if (lower.includes("créditos de mercado pago") || lower.includes("creditos de mercado pago")) {
    return { description: "Créditos Mercado Pago", medium: "Crédito MP", internal: false };
  }
  if (lower.startsWith("compra mercado libre")) {
    return { description: "Mercado Libre", medium: "Mercado Libre", internal: false };
  }

  return { description: t || "Movimiento", medium: "Cuenta", internal: false };
}

const MERCADO_PDF_DATE_RE = /^(\d{2}-\d{2}-\d{4})(?:\s+(.*))?$/;
const MERCADO_PDF_MONEY_RE = /\$\s*(-?\d{1,3}(?:\.\d{3})*,\d{2})/g;
const MERCADO_PDF_OP_ID_RE = /\b(\d{10,})\b/;
const MERCADO_PDF_TYPE_START_RE =
  /^(pago|transferencia|reserva|dinero|rendimientos|ingreso|compra)\b/i;

function isMercadoDebitoPdfNoise(line) {
  const l = String(line || "").toLowerCase();
  if (/^resumen de (cuenta|tenencias)/.test(l)) return true;
  if (/^detalle de movimientos/.test(l)) return true;
  if (/^fecha\b/.test(l)) return true;
  if (/^operaci[oó]n\b/.test(l)) return true;
  if (/^id de la\b/.test(l)) return true;
  if (/^\d+\/\d+$/.test(l)) return true;
  if (/saldo inicial|entradas:|salidas:|saldo final/.test(l)) return true;
  if (/periodo:|^cvu:|cuit\/?\s*cuil/.test(l)) return true;
  if (/^fecha de generaci/.test(l)) return true;
  if (/mercado libre s\.?r\.?l/.test(l)) return true;
  if (/^de consulta en:/.test(l)) return true;
  if (/^estas operaciones fueron realizadas/.test(l)) return true;
  if (/^comitente:/.test(l)) return true;
  return false;
}

function isMercadoDebitoPdfEnd(line) {
  return /resumen de tenencias/i.test(String(line || ""));
}

function countMercadoPdfMoney(blob) {
  const matches = String(blob || "").match(MERCADO_PDF_MONEY_RE);
  return matches ? matches.length : 0;
}

function toMercadoDebitoExpense(releaseDate, rawType, refId, amount) {
  const interpreted = interpretMercadoNewType(rawType);
  return {
    date: mercadoReleaseDateToDisplay(releaseDate),
    description: interpreted.description,
    raw_id: String(refId || ""),
    category: categorizeMercadoNewExport(interpreted.description, rawType),
    bank: "Mercado Pago",
    card_brand: interpreted.medium,
    card_type: "Débito",
    card_last4: null,
    amount,
    monthKey: mercadoReleaseDateToMonthKey(releaseDate),
    is_unknown: false,
    isInternal: interpreted.internal
  };
}

/**
 * Resumen PDF de Mercado Pago (cuenta en pesos). Compatible con el texto que arma pdf.js.
 */
export function parseMercadoDebitoPdf(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const expenses = [];
  const pendingDesc = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (isMercadoDebitoPdfEnd(line)) break;
    if (isMercadoDebitoPdfNoise(line)) continue;

    const dateMatch = line.match(MERCADO_PDF_DATE_RE);
    if (!dateMatch) {
      pendingDesc.push(line);
      continue;
    }

    let blob = [pendingDesc.join(" "), dateMatch[2] || ""].filter(Boolean).join(" ").trim();
    pendingDesc.length = 0;

    let j = i + 1;
    while (j < lines.length) {
      const next = lines[j];
      if (isMercadoDebitoPdfEnd(next) || isMercadoDebitoPdfNoise(next)) break;
      if (MERCADO_PDF_DATE_RE.test(next)) break;
      const moneysSoFar = countMercadoPdfMoney(blob);
      const nextMoneys = countMercadoPdfMoney(next);
      if (moneysSoFar >= 2) {
        if (nextMoneys > 0 || MERCADO_PDF_TYPE_START_RE.test(next)) break;
        blob = `${blob} ${next}`.trim();
        j += 1;
        break;
      }
      blob = `${blob} ${next}`.trim();
      j += 1;
    }
    i = j - 1;

    const moneyTokens = [...blob.matchAll(MERCADO_PDF_MONEY_RE)].map((m) => m[1]);
    if (!moneyTokens.length) continue;
    const amount = parseMercadoArgentineAmount(moneyTokens[0]);
    const opMatch = blob.match(MERCADO_PDF_OP_ID_RE);
    const refId = opMatch ? opMatch[1] : "";

    let rawType = blob;
    for (const token of moneyTokens) {
      rawType = rawType.replace(`$${token}`, " ").replace(`$ ${token}`, " ");
    }
    if (refId) rawType = rawType.replace(refId, " ");
    rawType = rawType.replace(/\$/g, " ").replace(/\s+/g, " ").trim();
    if (!rawType && amount === 0) continue;

    expenses.push(toMercadoDebitoExpense(dateMatch[1], rawType, refId, amount));
  }

  return expenses;
}

export function parseMercadoDebitoCsvNewExport(text) {
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
    if (parts.length < 4) continue;
    const row = {};
    headers.forEach((h, j) => {
      row[h] = parts[j] !== undefined ? String(parts[j]).trim() : "";
    });
    const releaseDate = row.RELEASE_DATE || "";
    const rawType = String(row.TRANSACTION_TYPE || "").replace(/\s+/g, " ").trim();
    const refId = row.REFERENCE_ID || "";
    const amount = parseMercadoArgentineAmount(row.TRANSACTION_NET_AMOUNT);
    if (!releaseDate && !rawType && amount === 0) continue;
    out.push(toMercadoDebitoExpense(releaseDate, rawType, refId, amount));
  }
  return out;
}
