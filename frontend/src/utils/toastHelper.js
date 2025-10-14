import { toast } from "sonner";
import { getCurrentTheme } from "@/utils/themeHelper";

// Unified, theme-aware toast system
export const notify = {
  success: (title, description) => showToast("success", title, description),
  error: (title, description) => showToast("error", title, description),
  info: (title, description) => showToast("info", title, description),
  warning: (title, description) => showToast("warning", title, description),
};

// Internal function to handle theming logic
function showToast(type, title, description) {
  const theme = getCurrentTheme(); // 'light' or 'dark'

  // Base color palette
  const colors = {
    success: { light: "#0f766e", dark: "#14b8a6" },
    error: { light: "#dc2626", dark: "#ef4444" },
    info: { light: "#2563eb", dark: "#3b82f6" },
    warning: { light: "#d97706", dark: "#fbbf24" },
  };

  const background = colors[type][theme];
  const textColor = theme === "dark" ? "#e2e8f0" : "white";
  const borderColor = theme === "dark" ? "#334155" : "#e2e8f0";

  const toastFn = toast[type] || toast;

  toastFn(title, {
    description,
    style: {
      background,
      color: textColor,
      border: `1px solid ${borderColor}`,
      fontSize: "0.95rem",
      padding: "12px 16px",
      borderRadius: "12px",
      boxShadow:
        theme === "dark"
          ? "0 4px 10px rgba(0,0,0,0.4)"
          : "0 4px 10px rgba(0,0,0,0.1)",
    },
  });
}
