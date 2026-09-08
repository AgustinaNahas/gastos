import React from "react";
import { Select } from "@mantine/core";

export default function FilterSelect({
  label,
  icon,
  value,
  onChange,
  data,
  placeholder,
  searchable = true,
  clearable = true,
  w
}) {
  return (
    <Select
      className="filter-select"
      label={label}
      leftSection={icon}
      data={data}
      value={value || null}
      onChange={(v) => onChange(v || "")}
      placeholder={placeholder}
      clearable={clearable}
      searchable={searchable}
      nothingFoundMessage="Sin coincidencias"
      comboboxProps={{ withinPortal: true }}
      w={w}
    />
  );
}
