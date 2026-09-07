import React, { useMemo, useState } from "react";
import { parseMoney } from "../parsers/statements";
import {
  PAID_BY_ME,
  PAID_BY_SANTI,
  formatMoneyAr,
  inputDateToDisplay,
  paidByOf,
  sharedShareAmount,
  santiOwesMe,
  todayInputDate
} from "../utils/sharedExpenses";

function moneyClass(n) {
  if (n < 0) return "amount-neg";
  if (n > 0) return "amount-pos";
  return "";
}

export default function SharedView({
  expenses,
  monthOptions,
  sharedMonth,
  setSharedMonth,
  categories,
  formatDateCellWithWeekday,
  onAddSantiExpense,
  onSetPaidBy,
  onUnshare,
  onDelete
}) {
  const [date, setDate] = useState(todayInputDate);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [flow, setFlow] = useState("out");
  const [category, setCategory] = useState("Otros");
  const [formError, setFormError] = useState("");

  const filtered = useMemo(
    () => expenses.filter((e) => !sharedMonth || e.monthKey === sharedMonth),
    [expenses, sharedMonth]
  );

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const da = String(a.date || "");
      const db = String(b.date || "");
      if (da === db) return (b.savedAt || 0) - (a.savedAt || 0);
      const ta = da.split("/").reverse().join("-");
      const tb = db.split("/").reverse().join("-");
      return tb.localeCompare(ta);
    });
    return copy;
  }, [filtered]);

  const balance = santiOwesMe(filtered);
  const paidByMe = filtered.filter((e) => paidByOf(e) === PAID_BY_ME);
  const paidBySanti = filtered.filter((e) => paidByOf(e) === PAID_BY_SANTI);
  const spentMe = paidByMe.filter((e) => Number(e.amount) < 0).reduce((s, e) => s + Math.abs(Number(e.amount || 0)), 0);
  const spentSanti = paidBySanti.filter((e) => Number(e.amount) < 0).reduce((s, e) => s + Math.abs(Number(e.amount || 0)), 0);
  const inMe = paidByMe.filter((e) => Number(e.amount) > 0).reduce((s, e) => s + Number(e.amount || 0), 0);
  const inSanti = paidBySanti.filter((e) => Number(e.amount) > 0).reduce((s, e) => s + Number(e.amount || 0), 0);

  function submitManual(ev) {
    ev.preventDefault();
    setFormError("");
    const displayDate = inputDateToDisplay(date);
    const desc = String(description || "").trim();
    const rawAmt = parseMoney(amount);
    if (!displayDate) {
      setFormError("Poné una fecha.");
      return;
    }
    if (!desc) {
      setFormError("Poné una descripción.");
      return;
    }
    if (!rawAmt) {
      setFormError("Poné un monto distinto de cero.");
      return;
    }
    const signed = flow === "in" ? Math.abs(rawAmt) : -Math.abs(rawAmt);
    void onAddSantiExpense({
      date: displayDate,
      description: desc,
      amount: signed,
      category: category || "Otros"
    }).then(() => {
      setDescription("");
      setAmount("");
      setFlow("out");
    });
  }

  const balanceText =
    Math.abs(balance) < 0.005
      ? "Están a mano"
      : balance > 0
        ? `Santi te debe $${formatMoneyAr(balance, { sign: false })}`
        : `Le debés $${formatMoneyAr(Math.abs(balance), { sign: false })} a Santi`;

  return (
    <section className="results-section panel">
      <h2 className="panel-title">Compartido con Santi</h2>
      <p className="shared-lead">
        A mitades. En la tabla marcá lo que pagaste vos; acá cargá lo que pagó él. El saldo dice quién queda debiendo.
      </p>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Saldo</div>
          <div className={`stat-value shared-balance ${moneyClass(balance)}`}>{balanceText}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pagaste vos (gastos)</div>
          <div className="stat-value muted">${formatMoneyAr(spentMe, { sign: false, digits: 0 })}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pagó Santi (gastos)</div>
          <div className="stat-value muted">${formatMoneyAr(spentSanti, { sign: false, digits: 0 })}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Movimientos</div>
          <div className="stat-value muted">{filtered.length}</div>
        </div>
      </div>
      {(inMe > 0 || inSanti > 0) && (
        <p className="shared-income-note">
          Entradas compartidas en esta vista: vos {formatMoneyAr(inMe)} · Santi {formatMoneyAr(inSanti)}
        </p>
      )}

      <div className="filters-toolbar">
        <div className="filter-group">
          <label htmlFor="shared-month">Mes</label>
          <select id="shared-month" value={sharedMonth} onChange={(e) => setSharedMonth(e.target.value)}>
            <option value="">Todos los meses</option>
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <form className="shared-add-form" onSubmit={submitManual}>
        <h3 className="shared-add-title">Agregar gasto de Santi</h3>
        <div className="shared-add-grid">
          <div className="filter-group">
            <label htmlFor="santi-date">Fecha</label>
            <input id="santi-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="filter-group shared-add-desc">
            <label htmlFor="santi-desc">Descripción</label>
            <input
              id="santi-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej. Super, Uber, alquiler"
            />
          </div>
          <div className="filter-group">
            <label htmlFor="santi-amount">Monto</label>
            <input
              id="santi-amount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="12.500,00"
            />
          </div>
          <div className="filter-group">
            <label htmlFor="santi-flow">Flujo</label>
            <select id="santi-flow" value={flow} onChange={(e) => setFlow(e.target.value)}>
              <option value="out">Gasto (salida)</option>
              <option value="in">Ingreso (entrada)</option>
            </select>
          </div>
          <div className="filter-group">
            <label htmlFor="santi-cat">Categoría</label>
            <select id="santi-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="shared-add-submit">
            <button type="submit" className="btn-primary">
              Guardar
            </button>
          </div>
        </div>
        {formError && <div className="alert-inline">{formError}</div>}
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Descripción</th>
              <th>Categoría</th>
              <th>Pagó</th>
              <th style={{ textAlign: "right" }}>Monto</th>
              <th style={{ textAlign: "right" }}>Mitad</th>
              <th> </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-table">
                  Todavía no hay movimientos compartidos en esta vista. Marcá gastos en la tabla o cargá uno de Santi
                  arriba.
                </td>
              </tr>
            ) : (
              sorted.map((e) => {
                const share = sharedShareAmount(e);
                const manual = String(e.sourceFile || "") === "manual-santi";
                return (
                  <tr key={e.id || e.dedupeKey}>
                    <td style={{ whiteSpace: "nowrap", color: "var(--muted)" }}>{formatDateCellWithWeekday(e.date)}</td>
                    <td>{e.description || "—"}</td>
                    <td>{e.category || "Otros"}</td>
                    <td>
                      <select
                        className="shared-payer-select"
                        value={paidByOf(e)}
                        onChange={(ev) => onSetPaidBy(e.id, ev.target.value)}
                        disabled={!e.id}
                        aria-label={`Quién pagó ${e.description || ""}`}
                      >
                        <option value={PAID_BY_ME}>Vos</option>
                        <option value={PAID_BY_SANTI}>Santi</option>
                      </select>
                    </td>
                    <td className={moneyClass(e.amount)} style={{ textAlign: "right" }}>
                      {formatMoneyAr(e.amount)}
                    </td>
                    <td className={moneyClass(share)} style={{ textAlign: "right" }}>
                      {formatMoneyAr(share)}
                    </td>
                    <td className="shared-row-actions">
                      {manual ? (
                        <button
                          type="button"
                          className="btn-ghost btn-inline btn-danger"
                          onClick={() => onDelete(e.id)}
                          disabled={!e.id}
                        >
                          Borrar
                        </button>
                      ) : (
                        <button type="button" className="btn-ghost btn-inline" onClick={() => onUnshare(e.id)} disabled={!e.id}>
                          Sacar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
