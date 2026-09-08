import React, { useMemo, useState } from "react";
import { Alert, Button, Select, TextInput, Title } from "@mantine/core";
import { IconCalendar, IconTag } from "@tabler/icons-react";
import { parseMoney } from "../parsers/statements";
import CategorySelect from "../components/CategorySelect";
import FilterSelect from "../components/FilterSelect";
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
  onDelete,
  categoryColors
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
      <Title order={2} className="panel-title">
        Compartido con Santi
      </Title>
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
        <FilterSelect
          label="Mes"
          icon={<IconCalendar size={16} />}
          value={sharedMonth}
          onChange={setSharedMonth}
          data={monthOptions.map((m) => ({ value: m.value, label: m.label }))}
          placeholder="Todos los meses"
        />
      </div>

      <form className="shared-add-form" onSubmit={submitManual}>
        <Title order={4} className="shared-add-title">
          Agregar gasto de Santi
        </Title>
        <div className="shared-add-grid">
          <TextInput
            id="santi-date"
            label="Fecha"
            type="date"
            value={date}
            onChange={(e) => setDate(e.currentTarget.value)}
            required
          />
          <TextInput
            className="shared-add-desc"
            id="santi-desc"
            label="Descripción"
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            placeholder="Ej. Super, Uber, alquiler"
          />
          <TextInput
            id="santi-amount"
            label="Monto"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.currentTarget.value)}
            placeholder="12.500,00"
          />
          <Select
            label="Flujo"
            data={[
              { value: "out", label: "Gasto (salida)" },
              { value: "in", label: "Ingreso (entrada)" }
            ]}
            value={flow}
            onChange={(v) => {
              if (v) setFlow(v);
            }}
            allowDeselect={false}
            searchable={false}
          />
          <CategorySelect
            label="Categoría"
            value={category}
            categories={categories}
            categoryColors={categoryColors}
            onChange={(v) => {
              if (v) setCategory(v);
            }}
            size="sm"
            leftSection={<IconTag size={16} />}
          />
          <div className="shared-add-submit">
            <Button type="submit">Guardar</Button>
          </div>
        </div>
        {formError && (
          <Alert mt="sm" color="red">
            {formError}
          </Alert>
        )}
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
                      <Select
                        size="xs"
                        data={[
                          { value: PAID_BY_ME, label: "Vos" },
                          { value: PAID_BY_SANTI, label: "Santi" }
                        ]}
                        value={paidByOf(e)}
                        onChange={(v) => {
                          if (v) onSetPaidBy(e.id, v);
                        }}
                        disabled={!e.id}
                        allowDeselect={false}
                        searchable={false}
                        aria-label={`Quién pagó ${e.description || ""}`}
                        w={110}
                      />
                    </td>
                    <td className={moneyClass(e.amount)} style={{ textAlign: "right" }}>
                      {formatMoneyAr(e.amount)}
                    </td>
                    <td className={moneyClass(share)} style={{ textAlign: "right" }}>
                      {formatMoneyAr(share)}
                    </td>
                    <td className="shared-row-actions">
                      {manual ? (
                        <Button color="red" variant="light" size="xs" onClick={() => onDelete(e.id)} disabled={!e.id}>
                          Borrar
                        </Button>
                      ) : (
                        <Button variant="default" size="xs" onClick={() => onUnshare(e.id)} disabled={!e.id}>
                          Sacar
                        </Button>
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
