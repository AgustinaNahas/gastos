import { createTheme } from "@mantine/core";

export const theme = createTheme({
  primaryColor: "sage",
  primaryShade: 5,
  fontFamily: '"Nunito Sans", system-ui, sans-serif',
  headings: { fontFamily: '"Fraunces", "Times New Roman", serif' },
  defaultRadius: "md",
  black: "#2f3b34",
  colors: {
    sage: [
      "#eef4f0",
      "#d5e4da",
      "#b7d0c0",
      "#96baa5",
      "#7da790",
      "#6f8f7a",
      "#5a7665",
      "#3f5a4a",
      "#32483c",
      "#24352c"
    ]
  },
  components: {
    Select: {
      defaultProps: {
        size: "sm",
        comboboxProps: { withinPortal: true }
      }
    },
    Button: {
      defaultProps: {
        radius: "md"
      }
    },
    Tabs: {
      defaultProps: {
        variant: "pills"
      }
    }
  }
});
