import React from "react";
import {
  ActionIcon,
  Button,
  Checkbox,
  Drawer,
  Group,
  Menu,
  SimpleGrid,
  Switch,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import {
  IconArrowsUpDown,
  IconBuildingBank,
  IconCalendar,
  IconColumns,
  IconCreditCard,
  IconStack2,
  IconTag,
  IconTags
} from "@tabler/icons-react";
import { COLUMN_DEFS, USE_DESCRIPTION_AS_CATEGORY } from "../columnConfig";
import CategorySelect from "../components/CategorySelect";
import FilterSelect from "../components/FilterSelect";
import { CAT_PALETTE_COUNT, resolveCategoryVisual } from "../utils/categoryVisual";

export function TableEmptyHint({ onGoImport }) {
  return (
    <section className="panel empty-tab-hint">
      <Title order={2} className="panel-title">
        Sin datos todavía
      </Title>
      <p className="empty-tab-text">
        Importá resúmenes en la pestaña <strong>Importar</strong> para ver la tabla de movimientos y filtros.
      </p>
      <Button onClick={onGoImport}>Ir a importar</Button>
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
  onCategoryChange,
  formatDateCellWithWeekday,
  displayExpenseMedium,
  exportFile,
  toggleExpenseShared
}) {
  return (
    <section className="results-section panel">
      <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="sm" mb="md">
        <div className="stat-card">
          <div className="stat-label">Gastos</div>
          <div className="stat-value negative">${stats.total.toLocaleString("es-AR", { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Movimientos</div>
          <div className="stat-value muted">{stats.movements}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Top</div>
          <div className="stat-value muted">{stats.top?.[0] || "—"}</div>
        </div>
      </SimpleGrid>

      <div className="filters-toolbar">
        <FilterSelect
          label="Mes"
          icon={<IconCalendar size={16} />}
          value={filters.month}
          onChange={(v) => setFilters((prev) => ({ ...prev, month: v }))}
          data={monthOptions.map((m) => ({ value: m.value, label: m.label }))}
          placeholder="Todos los meses"
        />
        <FilterSelect
          label="Categoría"
          icon={<IconTag size={16} />}
          value={filters.cat}
          onChange={(v) => setFilters((prev) => ({ ...prev, cat: v }))}
          data={categories.map((c) => ({ value: c, label: c }))}
          placeholder="Todas"
        />
        <FilterSelect
          label="Banco"
          icon={<IconBuildingBank size={16} />}
          value={filters.bank}
          onChange={(v) => setFilters((prev) => ({ ...prev, bank: v }))}
          data={banks.map((b) => ({ value: b, label: b }))}
          placeholder="Todos"
        />
        <FilterSelect
          label="Medio"
          icon={<IconCreditCard size={16} />}
          value={filters.card}
          onChange={(v) => setFilters((prev) => ({ ...prev, card: v }))}
          data={cards.map((c) => ({ value: c, label: c }))}
          placeholder="Todas"
        />
        <FilterSelect
          label="Tipo"
          icon={<IconStack2 size={16} />}
          value={filters.type}
          onChange={(v) => setFilters((prev) => ({ ...prev, type: v }))}
          data={[
            { value: "Crédito", label: "Crédito" },
            { value: "Débito", label: "Débito" }
          ]}
          placeholder="Crédito / Débito"
          searchable={false}
        />
        <FilterSelect
          label="Flujo"
          icon={<IconArrowsUpDown size={16} />}
          value={filters.flow}
          onChange={(v) => setFilters((prev) => ({ ...prev, flow: v }))}
          data={[
            { value: "in", label: "Solo entradas" },
            { value: "out", label: "Solo salidas" }
          ]}
          placeholder="Entradas + salidas"
          searchable={false}
        />
        <Switch
          className="filter-switch"
          label="Excluir entre cuentas"
          checked={Boolean(filters.excludeinterAccount)}
          onChange={(e) => setFilters((prev) => ({ ...prev, excludeinterAccount: e.currentTarget.checked }))}
          title="Ej.: DEBITO DEBIN RECURRENTE…, TRANSF. CTAS PROPIAS…, RESCATE FIMA…"
        />
        <Group gap="xs" wrap="nowrap" className="filter-actions">
          <Menu shadow="md" width={240} closeOnItemClick={false} position="bottom-end">
            <Menu.Target>
              <ActionIcon variant="default" size="lg" aria-label="Columnas visibles">
                <IconColumns size={18} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Columnas visibles</Menu.Label>
              {COLUMN_DEFS.map((col) => (
                <Menu.Item key={col.id} closeMenuOnClick={false}>
                  <Checkbox
                    label={col.label}
                    checked={Boolean(visibleColumns[col.id])}
                    onChange={() => toggleColumn(col.id)}
                  />
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
          <Button
            variant="light"
            leftSection={<IconTags size={16} />}
            onClick={() => setShowRulesConfig(true)}
          >
            Categorización
          </Button>
        </Group>
      </div>

      <Drawer
        opened={showRulesConfig}
        onClose={() => setShowRulesConfig(false)}
        title="Categorización"
        position="right"
        size="lg"
      >
        <Group justify="space-between" mb="md" wrap="wrap">
          <Text size="sm" c="dimmed" maw={420}>
            Guardá para aplicar reglas a filas automáticas. Las categorías editadas a mano en la tabla no se pisan.
          </Text>
          <Button onClick={() => commitRulesDraft()}>Guardar reglas</Button>
        </Group>

        <Title order={4} mb="sm">
          Editor de categorías
        </Title>
        <div className="cat-editor-layout">
          <section className="cat-editor-card">
            <h4>Crear categoría</h4>
            <Group align="flex-end" mb="md" wrap="wrap">
              <TextInput
                flex={1}
                value={newCategoryName}
                placeholder="Nueva categoría (ej: Mascotas)"
                onChange={(e) => setNewCategoryName(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCategory();
                  }
                }}
              />
              <Button variant="default" onClick={addCategory}>
                Agregar
              </Button>
            </Group>
            <h4>Crear subcategoría</h4>
            <Group align="flex-end" mb="sm" wrap="wrap">
              <CategorySelect
                label="Padre"
                value={subcategoryParent}
                categories={rootCategories}
                categoryColors={categoryColors}
                onChange={setSubcategoryParent}
                size="sm"
                allowCreateFromDescription={false}
              />
              <TextInput
                flex={1}
                value={newSubcategoryName}
                placeholder="Nueva subcategoría (ej: Streaming)"
                onChange={(e) => setNewSubcategoryName(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSubcategory();
                  }
                }}
              />
              <Button variant="default" onClick={addSubcategory}>
                + Subcat
              </Button>
            </Group>
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

        <Title order={4} mt="lg" mb="sm">
          Reglas por palabra clave
        </Title>
        {rulesDraft.keywordRules.map((rule, idx) => (
          <Group key={`kw-${idx}`} align="flex-end" mb="xs" wrap="nowrap">
            <TextInput
              flex={1}
              value={rule.keyword || ""}
              placeholder="Palabra o frase"
              onChange={(e) => updateKeywordRule(idx, { keyword: e.currentTarget.value })}
            />
            <CategorySelect
              value={rule.category || "Otros"}
              categories={categories}
              categoryColors={categoryColors}
              onChange={(v) => updateKeywordRule(idx, { category: v })}
              size="sm"
            />
            <ActionIcon
              variant="subtle"
              color="red"
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
            </ActionIcon>
          </Group>
        ))}
        <Button
          variant="default"
          size="xs"
          mb="lg"
          onClick={() =>
            setRulesDraft((prev) => ({
              ...prev,
              keywordRules: [...prev.keywordRules, { keyword: "", category: "Otros" }]
            }))
          }
        >
          + Agregar regla por palabra
        </Button>

        <Title order={4} mt="md" mb="sm">
          Reglas por transferencia a terceros
        </Title>
        {rulesDraft.transferRules.map((rule, idx) => (
          <Group key={`tr-${idx}`} align="flex-end" mb="xs" wrap="nowrap">
            <TextInput
              flex={1}
              value={rule.matcher || ""}
              placeholder="Texto que va dentro de [ ] (nombre, alias, CBU…)"
              onChange={(e) => updateTransferRule(idx, { matcher: e.currentTarget.value })}
            />
            <CategorySelect
              value={rule.category || "Otros"}
              categories={categories}
              categoryColors={categoryColors}
              onChange={(v) => updateTransferRule(idx, { category: v })}
              size="sm"
            />
            <ActionIcon
              variant="subtle"
              color="red"
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
            </ActionIcon>
          </Group>
        ))}
        <Button
          variant="default"
          size="xs"
          onClick={() =>
            setRulesDraft((prev) => ({
              ...prev,
              transferRules: [...prev.transferRules, { matcher: "", category: "Otros" }]
            }))
          }
        >
          + Agregar regla de transferencia
        </Button>
      </Drawer>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="th-select">
                <Checkbox
                  size="xs"
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
              <th className="th-shared" title="Compartido con Santi">
                Santi
              </th>
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
                const descExact = String(e.description || "").trim();
                return (
                  <tr key={e.id || `${e.dedupeKey}-${i}`} className={e.sharedWithSanti ? "row-shared" : undefined}>
                    <td className="td-select">
                      <Checkbox
                        size="xs"
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
                        <CategorySelect
                          value={e.category || "Otros"}
                          categories={categories}
                          categoryColors={categoryColors}
                          allowCreateFromDescription
                          onChange={(v) => {
                            if (v === USE_DESCRIPTION_AS_CATEGORY) {
                              if (!descExact) return;
                              onCategoryChange(e, descExact);
                            } else {
                              onCategoryChange(e, v);
                            }
                          }}
                        />
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
                    <td className="td-shared">
                      <Checkbox
                        size="xs"
                        checked={Boolean(e.sharedWithSanti)}
                        disabled={!e.id}
                        onChange={() => toggleExpenseShared(e)}
                        title={e.sharedWithSanti ? "Dejar de compartir con Santi" : "Marcar como compartido con Santi"}
                        aria-label={`Compartir con Santi: ${e.description || e.date || ""}`}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Group gap="sm" mt="md">
        <Button variant="default" onClick={() => exportFile("csv")}>
          Exportar CSV (vista actual)
        </Button>
        <Button variant="default" onClick={() => exportFile("json")}>
          Exportar JSON (vista actual)
        </Button>
      </Group>
    </section>
  );
}
