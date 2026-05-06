import React from "react";
import { COLUMN_DEFS, USE_DESCRIPTION_AS_CATEGORY } from "../columnConfig";
import { sortCategoriesList } from "../utils/expenseCategories";
import { CAT_PALETTE_COUNT, resolveCategoryVisual } from "../utils/categoryVisual";

const COLUMN_GEAR_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="100" height="100" viewBox="0 0 50 50">
    <path d="M 32.21875 2.0625 L 31.4375 2.375 L 28.625 3.46875 L 27.84375 3.78125 L 28.03125 4.59375 L 28.625 7.59375 C 28.332031 7.886719 28.019531 8.230469 27.6875 8.59375 L 24.71875 7.9375 L 23.90625 7.75 L 23.59375 8.5 L 22.375 11.3125 L 22.0625 12.0625 L 22.75 12.53125 L 25.3125 14.25 C 25.28125 14.738281 25.285156 15.230469 25.3125 15.71875 L 22.6875 17.34375 L 21.96875 17.78125 L 22.28125 18.5625 L 23.375 21.375 L 23.6875 22.15625 L 24.5 21.96875 L 27.5 21.375 C 27.804688 21.738281 28.140625 22.066406 28.5 22.375 L 27.8125 25.375 L 27.625 26.1875 L 28.40625 26.53125 L 31.21875 27.71875 L 31.96875 28.03125 L 32.4375 27.34375 L 34.15625 24.78125 C 34.644531 24.8125 35.136719 24.808594 35.625 24.78125 L 37.25 27.4375 L 37.6875 28.125 L 38.46875 27.84375 L 42.0625 26.40625 L 41.875 25.59375 L 41.1875 22.3125 C 41.5625 21.996094 41.902344 21.65625 42.21875 21.28125 L 45.25 22.0625 L 46.09375 22.28125 L 46.40625 21.5 L 47.625 18.6875 L 47.96875 17.90625 L 47.21875 17.4375 L 44.59375 15.84375 C 44.625 15.355469 44.621094 14.863281 44.59375 14.375 L 47.21875 12.75 L 47.9375 12.3125 L 47.625 11.53125 L 46.53125 8.71875 L 46.21875 7.9375 L 45.375 8.125 L 42.3125 8.8125 C 42.007813 8.449219 41.671875 8.121094 41.3125 7.8125 L 41.96875 4.8125 L 42.15625 4 L 41.40625 3.6875 L 38.59375 2.46875 L 37.8125 2.15625 L 37.34375 2.875 L 35.75 5.40625 C 35.289063 5.359375 34.789063 5.402344 34.28125 5.4375 L 32.65625 2.78125 Z M 31.375 4.53125 L 32.84375 6.9375 L 33.21875 7.53125 L 33.90625 7.375 C 34.613281 7.21875 35.28125 7.304688 36.1875 7.40625 L 36.8125 7.46875 L 37.15625 6.9375 L 38.59375 4.65625 L 39.84375 5.1875 L 39.21875 7.875 L 39.0625 8.53125 L 39.625 8.90625 C 40.238281 9.34375 40.75 9.855469 41.1875 10.46875 L 41.5625 11.03125 L 42.21875 10.875 L 44.96875 10.25 L 45.46875 11.5 L 43.0625 12.9375 L 42.53125 13.28125 L 42.59375 13.90625 C 42.6875 14.742188 42.6875 15.445313 42.59375 16.28125 L 42.53125 16.90625 L 43.0625 17.25 L 45.4375 18.71875 L 44.9375 19.90625 L 42.15625 19.21875 L 41.46875 19.0625 L 41.09375 19.625 C 40.65625 20.238281 40.144531 20.75 39.53125 21.1875 L 39 21.5625 L 39.125 22.21875 L 39.75 25.1875 L 38.5 25.65625 L 37.0625 23.28125 L 36.71875 22.75 L 36.09375 22.8125 C 35.257813 22.90625 34.554688 22.90625 33.71875 22.8125 L 33.09375 22.75 L 32.78125 23.25 L 31.25 25.5625 L 29.96875 25 L 30.5625 22.3125 L 30.71875 21.6875 L 30.1875 21.28125 C 29.574219 20.84375 29.0625 20.332031 28.625 19.71875 L 28.25 19.1875 L 27.59375 19.3125 L 24.90625 19.875 L 24.4375 18.625 L 26.8125 17.15625 L 27.375 16.8125 L 27.28125 16.1875 C 27.1875 15.351563 27.1875 14.648438 27.28125 13.8125 L 27.375 13.21875 L 26.84375 12.875 L 24.53125 11.34375 L 25.0625 10.0625 L 27.78125 10.6875 L 28.375 10.8125 L 28.75 10.34375 C 29.320313 9.679688 29.90625 9.09375 30.40625 8.59375 L 30.78125 8.21875 L 30.6875 7.71875 L 30.125 5.03125 Z M 35 10 C 32.25 10 30 12.25 30 15 C 30 17.75 32.25 20 35 20 C 37.75 20 40 17.75 40 15 C 40 12.25 37.75 10 35 10 Z M 35 12 C 36.667969 12 38 13.332031 38 15 C 38 16.667969 36.667969 18 35 18 C 33.332031 18 32 16.667969 32 15 C 32 13.332031 33.332031 12 35 12 Z M 13.53125 20 L 13.40625 20.84375 L 12.90625 24.09375 C 12.363281 24.265625 11.839844 24.515625 11.34375 24.78125 L 7.90625 22.28125 L 4.40625 25.78125 L 4.875 26.46875 L 6.78125 29.21875 C 6.511719 29.753906 6.273438 30.289063 6.09375 30.8125 L 2.8125 31.40625 L 2 31.5625 L 2 36.4375 L 2.8125 36.59375 L 6.09375 37.1875 C 6.269531 37.734375 6.511719 38.246094 6.78125 38.75 L 4.8125 41.40625 L 4.28125 42.09375 L 7.78125 45.59375 L 8.46875 45.125 L 11.21875 43.21875 C 11.753906 43.488281 12.289063 43.726563 12.8125 43.90625 L 13.3125 47.15625 L 13.4375 48 L 18.34375 48 L 18.46875 47.1875 L 19.09375 43.90625 C 19.636719 43.734375 20.160156 43.484375 20.65625 43.21875 L 24.09375 45.71875 L 27.59375 42.21875 L 27.125 41.53125 L 25.125 38.75 C 25.386719 38.222656 25.636719 37.703125 25.8125 37.1875 L 29.1875 36.59375 L 30 36.4375 L 30 31.53125 L 25.78125 30.90625 C 25.609375 30.367188 25.390625 29.839844 25.125 29.34375 L 27.125 26.59375 L 27.59375 25.90625 L 27.03125 25.3125 L 24.71875 22.90625 L 24.125 22.28125 L 23.40625 22.78125 L 20.65625 24.78125 C 20.128906 24.519531 19.609375 24.269531 19.09375 24.09375 L 18.59375 20.84375 L 18.46875 20 Z M 15.25 22 L 16.75 22 L 17.3125 25.5625 L 17.875 25.75 C 18.773438 26.050781 19.613281 26.332031 20.28125 26.75 L 20.84375 27.09375 L 21.375 26.71875 L 23.875 24.90625 L 25 26.09375 L 23.1875 28.625 L 22.78125 29.15625 L 23.15625 29.71875 C 23.605469 30.4375 23.957031 31.269531 24.125 32.03125 L 24.28125 32.6875 L 24.9375 32.78125 L 28 33.25 L 28 34.78125 L 24.9375 35.3125 L 24.34375 35.40625 L 24.15625 35.96875 C 23.855469 36.867188 23.574219 37.707031 23.15625 38.375 L 22.78125 38.9375 L 23.1875 39.46875 L 25 42 L 23.875 43.09375 L 21.375 41.28125 L 20.84375 40.90625 L 20.28125 41.25 C 19.5625 41.699219 18.730469 42.050781 17.96875 42.21875 L 17.34375 42.375 L 17.21875 43.03125 L 16.6875 46 L 15.15625 46 L 14.59375 42.4375 L 14.03125 42.25 C 13.132813 41.949219 12.292969 41.667969 11.625 41.25 L 11.0625 40.90625 L 10.53125 41.28125 L 8 43 L 6.90625 41.90625 L 8.6875 39.5 L 9.125 38.9375 L 8.75 38.375 C 8.300781 37.65625 7.949219 36.855469 7.78125 36.09375 L 7.625 35.4375 L 6.96875 35.3125 L 4 34.78125 L 4 33.21875 L 6.96875 32.6875 L 7.5625 32.5625 L 7.75 32.03125 C 8.050781 31.132813 8.332031 30.292969 8.75 29.625 L 9.09375 29.0625 L 8.71875 28.53125 L 7 26 L 8.125 24.90625 L 10.625 26.71875 L 11.15625 27.09375 L 11.71875 26.75 C 12.4375 26.300781 13.269531 25.949219 14.03125 25.78125 L 14.6875 25.625 L 14.78125 24.96875 Z M 16 29 C 13.253906 29 11 31.253906 11 34 C 11 36.746094 13.253906 39 16 39 C 18.746094 39 21 36.746094 21 34 C 21 31.253906 18.746094 29 16 29 Z M 16 31 C 17.65625 31 19 32.34375 19 34 C 19 35.65625 17.65625 37 16 37 C 14.34375 37 13 35.65625 13 34 C 13 32.34375 14.34375 31 16 31 Z"></path>
  </svg>
);

export function TableEmptyHint({ onGoImport }) {
  return (
    <section className="panel empty-tab-hint">
      <h2 className="panel-title">Sin datos todavía</h2>
      <p className="empty-tab-text">
        Importá resúmenes en la pestaña <strong>Importar</strong> para ver la tabla de movimientos y filtros.
      </p>
      <button type="button" className="btn-primary" onClick={onGoImport}>
        Ir a importar
      </button>
    </section>
  );
}

export default function TableView({
  stats,
  filters,
  setFilters,
  monthOptions,
  banks,
  cards,
  categories,
  rootCategories,
  categoryOptions,
  showColumnConfig,
  setShowColumnConfig,
  visibleColumns,
  toggleColumn,
  showRulesConfig,
  setShowRulesConfig,
  rulesDraft,
  setRulesDraft,
  commitRulesDraft,
  updateKeywordRule,
  updateTransferRule,
  newCategoryName,
  setNewCategoryName,
  addCategory,
  newSubcategoryName,
  setNewSubcategoryName,
  subcategoryParent,
  setSubcategoryParent,
  addSubcategory,
  categoryPaletteIndex,
  categoryVisualStyle,
  categoryColors,
  openColorPickerFor,
  setOpenColorPickerFor,
  setCategoryColor,
  setCategoryHexColor,
  removeCategory,
  sortedFilteredExpenses,
  renderSortableHeader,
  tableColSpan,
  selectedExpenseIds,
  toggleExpenseSelected,
  toggleSelectAllVisible,
  allVisibleSelected,
  visibleRowsWithId,
  updateExpenseCategory,
  formatDateCellWithWeekday,
  displayExpenseMedium,
  exportFile
}) {
  return (
    <section className="results-section panel">
      <h2 className="panel-title">Resultados</h2>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total gastos (vista actual)</div>
          <div className="stat-value negative">${stats.total.toLocaleString("es-AR", { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Cant. gastos</div>
          <div className="stat-value muted">{stats.count}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Movimientos en vista</div>
          <div className="stat-value muted">{stats.movements}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Top categoría</div>
          <div className="stat-value muted">{stats.top?.[0] || "—"}</div>
        </div>
      </div>

      <div className="filter-checkbox-bar">
        <label
          className="filter-checkbox-item"
          title="Ej.: DEBITO DEBIN RECURRENTE…, TRANSF. CTAS PROPIAS…, RESCATE FIMA…"
        >
          <input
            id="filter-inter-account"
            type="checkbox"
            checked={Boolean(filters.excludeinterAccount)}
            onChange={(e) => setFilters((prev) => ({ ...prev, excludeinterAccount: e.target.checked }))}
          />
          <span>Excluir movimientos entre cuentas</span>
        </label>
      </div>

      <div className="filters-toolbar">
        <div className="filter-group">
          <label htmlFor="filter-month">Mes</label>
          <select
            id="filter-month"
            value={filters.month}
            onChange={(e) => setFilters((prev) => ({ ...prev, month: e.target.value }))}
          >
            <option value="">Todos los meses</option>
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="filter-cat">Categoría</label>
          <select
            id="filter-cat"
            value={filters.cat}
            onChange={(e) => setFilters((prev) => ({ ...prev, cat: e.target.value }))}
          >
            <option value="">Todas</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="filter-bank">Banco / cuenta</label>
          <select
            id="filter-bank"
            value={filters.bank}
            onChange={(e) => setFilters((prev) => ({ ...prev, bank: e.target.value }))}
          >
            <option value="">Todos</option>
            {banks.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="filter-card">Marca / medio</label>
          <select
            id="filter-card"
            value={filters.card}
            onChange={(e) => setFilters((prev) => ({ ...prev, card: e.target.value }))}
          >
            <option value="">Todas</option>
            {cards.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="filter-type">Tipo</label>
          <select
            id="filter-type"
            value={filters.type}
            onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value }))}
          >
            <option value="">Crédito / Débito</option>
            <option value="Crédito">Crédito</option>
            <option value="Débito">Débito</option>
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="filter-flow">Flujo</label>
          <select
            id="filter-flow"
            value={filters.flow}
            onChange={(e) => setFilters((prev) => ({ ...prev, flow: e.target.value }))}
          >
            <option value="">Entradas + salidas</option>
            <option value="in">Solo entradas</option>
            <option value="out">Solo salidas</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Categorizacion</label>
          <button type="button" className="btn-ghost" onClick={() => setShowRulesConfig((v) => !v)}>
            {showRulesConfig ? "Ocultar reglas" : "Configurar reglas"}
          </button>
        </div>
      </div>

      <div className="column-config-mini-row">
        <span className="column-config-mini-label">Columnas</span>
        <button
          type="button"
          className={`btn-column-mini${showColumnConfig ? " is-open" : ""}`}
          onClick={() => setShowColumnConfig((v) => !v)}
          title={showColumnConfig ? "Ocultar columnas" : "Configurar columnas"}
          aria-label={showColumnConfig ? "Ocultar columnas" : "Configurar columnas"}
        >
          {COLUMN_GEAR_ICON}
        </button>
      </div>

      {showColumnConfig && (
        <div className="config-panel">
          <h3>Columnas visibles</h3>
          <div className="check-grid">
            {COLUMN_DEFS.map((col) => (
              <label key={col.id} className="check-item">
                <input type="checkbox" checked={Boolean(visibleColumns[col.id])} onChange={() => toggleColumn(col.id)} />
                <span>{col.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {showRulesConfig && (
        <div className="config-panel">
          <div className="rules-toolbar">
            <button type="button" className="btn-primary btn-save-rules" onClick={commitRulesDraft}>
              Guardar reglas
            </button>
            <span className="rules-toolbar-hint">
              Guardá para aplicar reglas a filas automáticas y persistir. Las categorías que editaste a mano en la tabla no se
              pisan. La knowledge base sigue teniendo prioridad en el resto.
            </span>
          </div>
          <h3>Editor de categorías</h3>
          <div className="cat-editor-layout">
            <section className="cat-editor-card">
              <h4>Crear categoría</h4>
              <div className="rule-row category-row">
                <input
                  className="rule-input"
                  value={newCategoryName}
                  placeholder="Nueva categoría (ej: Mascotas)"
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCategory();
                    }
                  }}
                />
                <button type="button" className="btn-ghost btn-inline btn-add-cat" onClick={addCategory}>
                  Agregar
                </button>
              </div>
              <h4>Crear subcategoría</h4>
              <div className="rule-row category-row">
                <select className="rule-cat" value={subcategoryParent} onChange={(e) => setSubcategoryParent(e.target.value)}>
                  {rootCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <input
                  className="rule-input"
                  value={newSubcategoryName}
                  placeholder="Nueva subcategoría (ej: Streaming)"
                  onChange={(e) => setNewSubcategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSubcategory();
                    }
                  }}
                />
                <button type="button" className="btn-ghost btn-inline btn-add-cat" onClick={addSubcategory}>
                  + Subcat
                </button>
              </div>
              <p className="cat-editor-help">
                Tip: las subcategorías se guardan como <strong>Categoría / Subcategoría</strong>.
              </p>
            </section>

            <section className="cat-editor-card">
              <h4>Estructura actual</h4>
              <div className="category-tree">
                {rootCategories.map((root) => {
                  const subs = categoryOptions.filter((c) => c.startsWith(`${root} / `));
                  const own = categoryOptions.includes(root) ? [root] : [];
                  const group = [...own, ...subs];
                  return (
                    <details key={root} className="cat-group" open>
                      <summary className="cat-group-summary">
                        <span>{root}</span>
                        <span className="cat-group-count">{group.length}</span>
                      </summary>
                      <div className="chip-list">
                        {group.map((cat) => {
                          const selectedIdx = categoryPaletteIndex(cat);
                          const visual = categoryVisualStyle(cat);
                          return (
                            <div key={cat} className="cat-chip-row">
                              <button
                                type="button"
                                className={`cat-palette-dot${selectedIdx === null ? "" : ` cat-palette-${selectedIdx}`}`}
                                style={selectedIdx === null ? { background: visual.backgroundColor } : undefined}
                                title="Elegir color"
                                aria-label={`Cambiar color de categoría ${cat}`}
                                onClick={() => setOpenColorPickerFor((prev) => (prev === cat ? null : cat))}
                              />
                              <span className="cat-chip" style={visual}>
                                {cat}
                              </span>
                              {openColorPickerFor === cat && (
                                <div className="cat-color-popover" role="listbox" aria-label={`Colores para ${cat}`}>
                                  {Array.from({ length: CAT_PALETTE_COUNT }, (_, idx) => (
                                    <button
                                      key={`${cat}-color-${idx}`}
                                      type="button"
                                      className={`cat-color-option cat-palette-${idx}${selectedIdx === idx ? " is-selected" : ""}`}
                                      onClick={() => setCategoryColor(cat, idx)}
                                      aria-label={`Elegir color ${idx + 1} para ${cat}`}
                                    />
                                  ))}
                                  <input
                                    type="color"
                                    className="cat-color-picker"
                                    value={resolveCategoryVisual(cat, categoryColors).bg}
                                    onChange={(e) => setCategoryHexColor(cat, e.target.value)}
                                    aria-label={`Color personalizado para ${cat}`}
                                  />
                                </div>
                              )}
                              {cat !== "Otros" && (
                                <button
                                  type="button"
                                  className="chip-remove"
                                  onClick={() => removeCategory(cat)}
                                  aria-label={`Quitar ${cat}`}
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  );
                })}
              </div>
            </section>
          </div>

          <h3>Reglas por palabra clave</h3>
          {rulesDraft.keywordRules.map((rule, idx) => (
            <div key={`kw-${idx}`} className="rule-row">
              <input
                className="rule-input"
                value={rule.keyword || ""}
                placeholder="Palabra o frase"
                onChange={(e) => updateKeywordRule(idx, { keyword: e.target.value })}
              />
              <select
                className="rule-cat"
                value={rule.category || "Otros"}
                onChange={(e) => updateKeywordRule(idx, { category: e.target.value })}
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="rule-remove"
                title="Quitar regla"
                aria-label="Quitar regla"
                onClick={() =>
                  setRulesDraft((prev) => ({
                    ...prev,
                    keywordRules: prev.keywordRules.filter((_, i) => i !== idx)
                  }))
                }
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn-ghost btn-inline"
            onClick={() =>
              setRulesDraft((prev) => ({
                ...prev,
                keywordRules: [...prev.keywordRules, { keyword: "", category: "Otros" }]
              }))
            }
          >
            + Agregar regla por palabra
          </button>

          <h3 style={{ marginTop: 14 }}>Reglas por transferencia a terceros</h3>
          {rulesDraft.transferRules.map((rule, idx) => (
            <div key={`tr-${idx}`} className="rule-row">
              <input
                className="rule-input"
                value={rule.matcher || ""}
                placeholder="Texto que va dentro de [ ] (nombre, alias, CBU…)"
                onChange={(e) => updateTransferRule(idx, { matcher: e.target.value })}
              />
              <select
                className="rule-cat"
                value={rule.category || "Otros"}
                onChange={(e) => updateTransferRule(idx, { category: e.target.value })}
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="rule-remove"
                title="Quitar regla"
                aria-label="Quitar regla"
                onClick={() =>
                  setRulesDraft((prev) => ({
                    ...prev,
                    transferRules: prev.transferRules.filter((_, i) => i !== idx)
                  }))
                }
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn-ghost btn-inline"
            onClick={() =>
              setRulesDraft((prev) => ({
                ...prev,
                transferRules: [...prev.transferRules, { matcher: "", category: "Otros" }]
              }))
            }
          >
            + Agregar regla de transferencia
          </button>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="th-select">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  disabled={visibleRowsWithId.length === 0}
                  onChange={toggleSelectAllVisible}
                  title="Seleccionar movimientos visibles"
                  aria-label="Seleccionar todos los movimientos visibles"
                />
              </th>
              {visibleColumns.date && renderSortableHeader("Fecha", "date")}
              {visibleColumns.description && renderSortableHeader("Descripción", "description")}
              {visibleColumns.category && renderSortableHeader("Categoría", "category")}
              {visibleColumns.bank && renderSortableHeader("Banco", "bank")}
              {visibleColumns.medium && renderSortableHeader("Medio", "medium")}
              {visibleColumns.type && renderSortableHeader("Tipo", "type")}
              {visibleColumns.source && renderSortableHeader("Origen", "source")}
              {visibleColumns.amount && renderSortableHeader("Monto", "amount", "right")}
            </tr>
          </thead>
          <tbody>
            {sortedFilteredExpenses.length === 0 ? (
              <tr>
                <td colSpan={tableColSpan} className="empty-table">
                  No hay movimientos con los filtros actuales. Probá otro mes o limpiá filtros.
                </td>
              </tr>
            ) : (
              sortedFilteredExpenses.map((e, i) => {
                const catOpts = categories.includes(e.category) ? categories : sortCategoriesList([...categories, e.category]);
                const descExact = String(e.description || "").trim();
                const pal = categoryPaletteIndex(e.category);
                return (
                  <tr key={e.id || `${e.dedupeKey}-${i}`}>
                    <td className="td-select">
                      <input
                        type="checkbox"
                        checked={Boolean(e.id && selectedExpenseIds.includes(e.id))}
                        disabled={!e.id}
                        onChange={() => toggleExpenseSelected(e.id)}
                        aria-label={`Seleccionar movimiento ${e.date || ""}`}
                      />
                    </td>
                    {visibleColumns.date && (
                      <td style={{ whiteSpace: "nowrap", color: "var(--muted)" }}>{formatDateCellWithWeekday(e.date)}</td>
                    )}
                    {visibleColumns.description && <td>{e.description || "—"}</td>}
                    {visibleColumns.category && (
                      <td className="td-cat-select">
                        <select
                          className={`table-cat-select${pal === null ? "" : ` cat-palette-${pal}`}`}
                          style={categoryVisualStyle(e.category)}
                          value={e.category || "Otros"}
                          title={e.category || ""}
                          onChange={(ev) => {
                            const v = ev.target.value;
                            if (v === USE_DESCRIPTION_AS_CATEGORY) {
                              if (!descExact) return;
                              updateExpenseCategory(e, descExact);
                            } else {
                              updateExpenseCategory(e, v);
                            }
                          }}
                        >
                          {catOpts.map((c) => (
                            <option key={c} value={c}>
                              {c.length > 48 ? `${c.slice(0, 45)}…` : c}
                            </option>
                          ))}
                          <option value={USE_DESCRIPTION_AS_CATEGORY}>+ Usar descripción exacta como categoría nueva</option>
                        </select>
                      </td>
                    )}
                    {visibleColumns.bank && <td>{e.bank || "—"}</td>}
                    {visibleColumns.medium && <td>{displayExpenseMedium(e)}</td>}
                    {visibleColumns.type && <td>{e.card_type || "—"}</td>}
                    {visibleColumns.source && (
                      <td title={e.sourceFile || ""} style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {e.sourceFile || "—"}
                      </td>
                    )}
                    {visibleColumns.amount && (
                      <td
                        style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                        className={e.amount < 0 ? "amount-neg" : "amount-pos"}
                      >
                        {e.amount < 0 ? "" : "+"}
                        {Number(e.amount || 0).toLocaleString("es-AR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="export-row">
        <button type="button" className="btn-ghost" onClick={() => exportFile("csv")}>
          Exportar CSV (vista actual)
        </button>
        <button type="button" className="btn-ghost" onClick={() => exportFile("json")}>
          Exportar JSON (vista actual)
        </button>
      </div>
    </section>
  );
}
