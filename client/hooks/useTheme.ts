import { useThemeContext } from "@/contexts/ThemeContext";

export function useTheme() {
  const { theme, isDark, preference, setPreference } = useThemeContext();

  return {
    theme,
    isDark,
    preference,
    setPreference,
  };
}
