import React, { useMemo } from "react";
import { Box, Group, Select, Text } from "@mantine/core";
import { USE_DESCRIPTION_AS_CATEGORY } from "../columnConfig";
import { resolveCategoryVisual } from "../utils/categoryVisual";

function Swatch({ color }) {
  return (
    <Box
      className="cat-swatch"
      style={{ background: color }}
      aria-hidden="true"
    />
  );
}

export default function CategorySelect({
  value,
  categories,
  categoryColors,
  onChange,
  size = "xs",
  allowCreateFromDescription = false,
  searchable = true,
  clearable = false,
  placeholder,
  label,
  leftSection: leftSectionProp,
  w,
  style
}) {
  const data = useMemo(() => {
    const list = Array.isArray(categories) ? [...categories] : [];
    if (value && !list.includes(value) && value !== USE_DESCRIPTION_AS_CATEGORY) {
      list.push(value);
    }
    const opts = list.map((c) => ({
      value: c,
      label: c.length > 48 ? `${c.slice(0, 45)}…` : c
    }));
    if (allowCreateFromDescription) {
      opts.push({
        value: USE_DESCRIPTION_AS_CATEGORY,
        label: "+ Usar descripción exacta como categoría nueva"
      });
    }
    return opts;
  }, [categories, value, allowCreateFromDescription]);

  const visual = resolveCategoryVisual(value, categoryColors);

  return (
    <Select
      size={size}
      label={label}
      data={data}
      value={value || null}
      onChange={(v) => {
        if (v == null) {
          if (clearable) onChange("");
          return;
        }
        onChange(v);
      }}
      allowDeselect={clearable}
      clearable={clearable}
      searchable={searchable}
      placeholder={placeholder}
      nothingFoundMessage="Sin coincidencias"
      leftSection={leftSectionProp ?? (value ? <Swatch color={visual.bg} /> : undefined)}
      renderOption={({ option }) => {
        if (option.value === USE_DESCRIPTION_AS_CATEGORY) {
          return (
            <Text size="sm" c="dimmed">
              {option.label}
            </Text>
          );
        }
        const optVisual = resolveCategoryVisual(option.value, categoryColors);
        return (
          <Group gap={8} wrap="nowrap">
            <Swatch color={optVisual.bg} />
            <Text size="sm" lineClamp={1}>
              {option.label}
            </Text>
          </Group>
        );
      }}
      comboboxProps={{ withinPortal: true }}
      w={w}
      style={style}
      classNames={{ dropdown: "cat-select-dropdown" }}
    />
  );
}
