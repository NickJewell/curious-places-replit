import { Platform } from "react-native";

export const Colors = {
  light: {
    text: "#1A1A1A",
    textSecondary: "#6B6560",
    textAccent: "#7A6230",
    buttonText: "#FFFFFF",
    tabIconDefault: "#8A8F9A",
    tabIconSelected: "#7A6230",
    link: "#6B5535",
    backgroundRoot: "#F5F2ED",
    backgroundDefault: "#FFFFFF",
    backgroundSecondary: "#EDE9E3",
    backgroundTertiary: "#E0DBD4",
    backgroundCard: "#FFFFFF",
    border: "#D4CFC7",
    inactive: "#B0ABA3",
    accent: "#8B7355",
    accentSecondary: "#5A7AAF",
    categoryGhost: "#9B8AA4",
    categoryFolklore: "#7A8450",
    categoryHistorical: "#8B7355",
    categoryFortean: "#6B5B8E",
  },
  dark: {
    text: "#E8E6E3",
    textSecondary: "#A8A5A0",
    textAccent: "#D4AF7A",
    buttonText: "#FFFFFF",
    tabIconDefault: "#8A8F9A",
    tabIconSelected: "#D4AF7A",
    link: "#8B7355",
    backgroundRoot: "#0A0E14",
    backgroundDefault: "#151A23",
    backgroundSecondary: "#1E242E",
    backgroundTertiary: "#2A2F3A",
    backgroundCard: "#151A23",
    border: "#2A2F3A",
    inactive: "#4A4E57",
    accent: "#8B7355",
    accentSecondary: "#4A5F7F",
    categoryGhost: "#9B8AA4",
    categoryFolklore: "#7A8450",
    categoryHistorical: "#8B7355",
    categoryFortean: "#6B5B8E",
  },
};

export type ThemeColors = typeof Colors.dark;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
  "5xl": 48,
  inputHeight: 48,
  buttonHeight: 52,
};

export const BorderRadius = {
  xs: 8,
  sm: 12,
  md: 18,
  lg: 24,
  xl: 30,
  "2xl": 40,
  "3xl": 50,
  full: 9999,
};

export const Typography = {
  largeTitle: {
    fontSize: 34,
    fontWeight: "700" as const,
  },
  title: {
    fontSize: 28,
    fontWeight: "600" as const,
  },
  headline: {
    fontSize: 17,
    fontWeight: "600" as const,
  },
  h1: {
    fontSize: 32,
    fontWeight: "700" as const,
  },
  h2: {
    fontSize: 28,
    fontWeight: "700" as const,
  },
  h3: {
    fontSize: 24,
    fontWeight: "600" as const,
  },
  h4: {
    fontSize: 20,
    fontWeight: "600" as const,
  },
  body: {
    fontSize: 17,
    fontWeight: "400" as const,
  },
  callout: {
    fontSize: 16,
    fontWeight: "400" as const,
  },
  small: {
    fontSize: 14,
    fontWeight: "400" as const,
  },
  caption: {
    fontSize: 12,
    fontWeight: "400" as const,
  },
  link: {
    fontSize: 16,
    fontWeight: "400" as const,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded:
      "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

export const CategoryColors: Record<string, string> = {
  ghost: Colors.dark.categoryGhost,
  folklore: Colors.dark.categoryFolklore,
  historical: Colors.dark.categoryHistorical,
  fortean: Colors.dark.categoryFortean,
};

export const CategoryIcons: Record<string, string> = {
  ghost: "cloud",
  folklore: "book-open",
  historical: "clock",
  fortean: "eye",
};
