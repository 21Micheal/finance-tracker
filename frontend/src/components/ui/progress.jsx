import React from "react";
import clsx from "clsx";

/**
 * A simple progress bar component built with Tailwind.
 * @param {number} value - The current progress percentage (0–100)
 */
export function Progress({ value = 0, className }) {
  return (
    <div
      className={clsx(
        "w-full h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden",
        className
      )}
    >
      <div
        className="h-full bg-indigo-600 transition-all duration-500 ease-out"
        style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
      />
    </div>
  );
}
