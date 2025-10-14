import { useTheme } from "@/context/ThemeContext";

// For React components
export function useCurrentTheme() {
  const { theme } = useTheme();
  return theme;
}

// For non-React utils (like toastHelper)
export function getCurrentTheme() {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}
