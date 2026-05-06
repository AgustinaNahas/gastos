export const COLUMN_DEFS = [
  { id: "date", label: "Fecha" },
  { id: "description", label: "Descripcion" },
  { id: "category", label: "Categoria" },
  { id: "bank", label: "Banco" },
  { id: "medium", label: "Medio" },
  { id: "type", label: "Tipo" },
  { id: "source", label: "Origen" },
  { id: "amount", label: "Monto" }
];

export const DEFAULT_VISIBLE_COLUMNS = {
  date: true,
  description: true,
  category: true,
  bank: true,
  medium: true,
  type: true,
  source: false,
  amount: true
};

export const USE_DESCRIPTION_AS_CATEGORY = "__USE_DESCRIPTION_AS_CATEGORY__";
