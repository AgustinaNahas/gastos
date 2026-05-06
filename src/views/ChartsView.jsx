import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { resolveCategoryVisual } from "../utils/categoryVisual";
import { pieSlicePath } from "../utils/chartPie";

function formatBarMoney(n) {
  return Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ChartsEmptyHint({ onGoImport }) {
  return (
    <section className="panel empty-tab-hint">
      <h2 className="panel-title">Sin datos para gráficos</h2>
      <p className="empty-tab-text">Cargá movimientos desde <strong>Importar</strong> para ver tortas y rankings por mes.</p>
      <button type="button" className="btn-primary" onClick={onGoImport}>
        Ir a importar
      </button>
    </section>
  );
}

export default function ChartsView({
  chartMonth,
  setChartMonth,
  monthOptions,
  chartInsights,
  categoryColors,
  chartPieGranularity,
  setChartPieGranularity
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const infoWrapRef = useRef(null);
  const [barExpensesTip, setBarExpensesTip] = useState(null);

  function showBarExpensesTip(e, title, expenses, showDate = false) {
    if (!expenses?.length) return;
    setBarExpensesTip({
      x: e.clientX,
      y: e.clientY,
      title,
      expenses,
      showDate
    });
  }

  function moveBarExpensesTip(e) {
    setBarExpensesTip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : null));
  }

  function hideBarExpensesTip() {
    setBarExpensesTip(null);
  }

  useEffect(() => {
    if (!infoOpen) return undefined;
    function onDocMouseDown(ev) {
      if (infoWrapRef.current && !infoWrapRef.current.contains(ev.target)) {
        setInfoOpen(false);
      }
    }
    function onKey(ev) {
      if (ev.key === "Escape") setInfoOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [infoOpen]);

  useEffect(() => {
    setBarExpensesTip(null);
  }, [chartMonth]);

  const barTipPortal =
    barExpensesTip &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        className={`bar-expenses-tooltip-float${barExpensesTip.showDate ? " bar-expenses-tooltip-float--with-date" : ""}`}
        style={{
          left: Math.max(8, Math.min(barExpensesTip.x + 12, window.innerWidth - 300)),
          top: barExpensesTip.y + 12
        }}
        role="tooltip"
      >
        <div className="bar-expenses-tooltip-float-title">{barExpensesTip.title}</div>
        <ul className="bar-expenses-tooltip-float-list">
          {barExpensesTip.expenses.map((line, i) => (
            <li key={i} className="bar-expenses-tooltip-float-row">
              {barExpensesTip.showDate && line.date ? (
                <span className="bar-exp-float-date">{line.date}</span>
              ) : null}
              <span className="bar-exp-float-desc" title={line.description}>
                {line.description.length > 44 ? `${line.description.slice(0, 41)}…` : line.description}
              </span>
              <span className="bar-exp-float-cat">{line.category}</span>
              <span className="bar-exp-float-amt">${formatBarMoney(line.amount)}</span>
            </li>
          ))}
        </ul>
      </div>,
      document.body
    );

  return (
    <section className="panel charts-section">
      <div className="charts-section-header">
        <h2 className="panel-title">Gráficos del mes</h2>
        <div className="chart-info-wrap" ref={infoWrapRef}>
          <button
            type="button"
            className="chart-info-btn"
            aria-expanded={infoOpen}
            aria-controls="charts-disclaimer-tooltip"
            aria-label="Información: qué incluyen estos gráficos"
            onClick={() => setInfoOpen((v) => !v)}
          >
            <span aria-hidden="true">i</span>
          </button>
          {infoOpen && (
            <div id="charts-disclaimer-tooltip" className="chart-info-tooltip" role="tooltip">
              <p className="chart-info-tooltip-text">
                Solo se consideran <strong>gastos</strong> (importes negativos). Por defecto no se incluyen movimientos entre
                cuentas propias ni los débitos por <strong>pago de resumen de tarjeta</strong> (p. ej. “PAGO TARJETA MASTER”,
                “PAGO VISA ELECTRÓNICO”, textos partidos con guiones en el PDF). Los gráficos <strong>por día del mes</strong> y{" "}
                <strong>por día de la semana</strong> excluyen además las categorías raíz <strong>Servicios</strong> y{" "}
                <strong>Tarjetas</strong> (incluidas subcategorías bajo esas raíces), para enfocarse en el gasto más variable.
              </p>
            </div>
          )}
        </div>
      </div>
      <div className="chart-toolbar">
        <label htmlFor="chart-month" className="chart-month-label">
          Mes
        </label>
        <select
          id="chart-month"
          className="chart-month-select"
          value={chartMonth}
          onChange={(e) => setChartMonth(e.target.value)}
        >
          {monthOptions.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <label htmlFor="chart-pie-granularity" className="chart-month-label">
          Torta por
        </label>
        <select
          id="chart-pie-granularity"
          className="chart-month-select"
          value={chartPieGranularity}
          onChange={(e) => setChartPieGranularity(e.target.value)}
          aria-label="Agrupación de la torta de categorías"
        >
          <option value="subcategories">Subcategorías</option>
          <option value="categories">Categorías</option>
        </select>
      </div>
      {chartMonth && (
        <>
          <div className="chart-summary-cards">
            <div className="stat-card">
              <div className="stat-label">Total gastos del mes</div>
              <div className="stat-value negative">
                ${chartInsights.totalGastos.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Cantidad de gastos</div>
              <div className="stat-value muted">{chartInsights.countGastos}</div>
            </div>
          </div>

          <div className="charts-grid">
            <div className="chart-card">
              <h3 className="chart-card-title">Gastos por categoría</h3>
              {chartInsights.pieSlices.length === 0 ? (
                <p className="chart-empty">No hay gastos con importe negativo en este mes.</p>
              ) : (
                <div className="pie-wrap">
                  <svg viewBox="0 0 200 200" className="pie-svg" aria-hidden="true">
                    {chartInsights.pieSlices.map((s) => (
                      <path
                        key={s.label}
                        d={pieSlicePath(100, 100, 88, s.a0, s.a1)}
                        fill={resolveCategoryVisual(s.label, categoryColors).bg}
                        stroke="var(--surface)"
                        strokeWidth="1"
                      />
                    ))}
                  </svg>
                  <ul className="pie-legend">
                    {chartInsights.pieSlices.map((s) => (
                      <li key={s.label} className="pie-legend-row">
                        <span
                          className="pie-legend-swatch"
                          style={{
                            background: resolveCategoryVisual(s.label, categoryColors).bg
                          }}
                        />
                        <span className="pie-legend-name">{s.label}</span>
                        <span className="pie-legend-pct">{s.pct.toFixed(1)}%</span>
                        <span className="pie-legend-amt">${s.value.toLocaleString("es-AR", { maximumFractionDigits: 0 })}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="chart-card">
              <h3 className="chart-card-title">Mayores gastos del mes</h3>
              {chartInsights.topGastos.length === 0 ? (
                <p className="chart-empty">Sin datos.</p>
              ) : (
                <ol className="ranking-list">
                  {chartInsights.topGastos.map((e, idx) => (
                    <li key={`${e.key}-${idx}`} className="ranking-item">
                      <span className="ranking-pos">{idx + 1}</span>
                      <div className="ranking-body">
                        <div className="ranking-desc" title={e.description || ""}>
                          {e.description || "—"}
                        </div>
                        <div className="ranking-meta">
                          {e.count} movimiento(s) · {e.category || "Otros"}
                        </div>
                      </div>
                      <span className="ranking-amt">
                        $
                        {Math.abs(Number(e.total || 0)).toLocaleString("es-AR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          <div className="chart-card chart-card-wide">
            <h3 className="chart-card-title">Gastos por día del mes</h3>
            <p className="chart-card-hint">
              Sin Servicios ni Tarjetas (gasto más variable; ver ícono <span aria-hidden="true">i</span> para detalle).
            </p>
            {chartInsights.dailyBars.length === 0 ? (
              <p className="chart-empty">No hay gastos con fecha reconocible en este mes (con este criterio).</p>
            ) : (
              <div className="daily-bars" role="img" aria-label="Gastos acumulados por día del mes">
                {chartInsights.dailyBars.map((row) => {
                  const h = Math.round((row.total / chartInsights.maxDay) * 100);
                  const [y, mo, d] = row.day.split("-");
                  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
                  const dayLbl = Number.isNaN(dt.getTime())
                    ? row.day
                    : dt.toLocaleDateString("es-AR", { weekday: "short", day: "numeric" });
                  return (
                    <div
                      key={row.day}
                      className="daily-bar-col daily-bar-col--tip"
                      onMouseEnter={(e) =>
                        showBarExpensesTip(
                          e,
                          `${dayLbl} · Total $${formatBarMoney(row.total)}`,
                          row.expenses
                        )
                      }
                      onMouseMove={moveBarExpensesTip}
                      onMouseLeave={hideBarExpensesTip}
                    >
                      <div className="daily-bar-track">
                        <div className="daily-bar-fill" style={{ height: `${h}%` }} />
                      </div>
                      <span className="daily-bar-label">{dayLbl}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="chart-card chart-card-wide">
            <h3 className="chart-card-title">Gastos por día de la semana</h3>
            <p className="chart-card-hint">Total del mes sumado por lun–dom (mismo criterio que el gráfico anterior).</p>
            {chartInsights.weekdayBars.every((w) => w.total === 0) ? (
              <p className="chart-empty">No hay datos con este criterio.</p>
            ) : (
              <div
                className="daily-bars weekday-bars"
                role="img"
                aria-label="Gastos del mes acumulados por día de la semana"
              >
                {chartInsights.weekdayBars.map((row) => {
                  const h = Math.round((row.total / chartInsights.maxWeekday) * 100);
                  const cap =
                    row.label.charAt(0).toUpperCase() + row.label.slice(1).replace(/\.$/, "");
                  return (
                    <div
                      key={row.dow}
                      className="daily-bar-col daily-bar-col--tip"
                      onMouseEnter={(e) =>
                        showBarExpensesTip(
                          e,
                          `${cap} · Total $${formatBarMoney(row.total)} · ${row.expenses?.length ?? 0} mov.`,
                          row.expenses,
                          true
                        )
                      }
                      onMouseMove={moveBarExpensesTip}
                      onMouseLeave={hideBarExpensesTip}
                    >
                      <div className="daily-bar-track">
                        <div className="daily-bar-fill" style={{ height: `${h}%` }} />
                      </div>
                      <span className="daily-bar-label">{cap}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
      {barTipPortal}
    </section>
  );
}
