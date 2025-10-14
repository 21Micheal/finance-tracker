import React from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";


export default function CustomToast({ title, message, type }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const icons = {
    warning: <AlertTriangle className="text-yellow-500" size={22} />,
    success: <CheckCircle className="text-green-500" size={22} />,
    danger: <TrendingDown className="text-red-500" size={22} />,
    info: <TrendingUp className="text-blue-500" size={22} />,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.25 }}
      className={`flex items-center gap-3 p-4 rounded-2xl shadow-md border-l-4 ${
        type === "warning"
          ? "border-yellow-400"
          : type === "success"
          ? "border-green-400"
          : type === "danger"
          ? "border-red-400"
          : "border-blue-400"
      } ${isDark ? "bg-slate-800 text-gray-100" : "bg-white text-gray-800"}`}
    >
      <div>{icons[type] || icons.info}</div>
      <div className="flex-1">
        <h4 className="font-semibold">{title}</h4>
        <p className="text-sm opacity-80">{message}</p>

        <div className="mt-2 h-1 w-full bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: "100%" }}
            animate={{ width: 0 }}
            transition={{ duration: 5, ease: "linear" }}
            className={`h-full ${
              type === "warning"
                ? "bg-yellow-400"
                : type === "success"
                ? "bg-green-400"
                : type === "danger"
                ? "bg-red-400"
                : "bg-blue-400"
            }`}
          />
        </div>
      </div>
    </motion.div>
  );
}
