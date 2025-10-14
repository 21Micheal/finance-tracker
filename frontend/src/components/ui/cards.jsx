import React from "react";
import clsx from "clsx";

/**
 * Basic Card container with consistent rounded corners, padding, and shadows.
 */
export function Card({ className, children, ...props }) {
  return (
    <div
      className={clsx(
        "bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700",
        "transition-all duration-300 hover:shadow-md",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Optional card header for titles or top elements
 */
export function CardHeader({ className, children }) {
  return (
    <div
      className={clsx(
        "border-b border-slate-200 dark:border-slate-700 px-4 py-3",
        "flex items-center justify-between",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Optional card title section
 */
export function CardTitle({ className, children }) {
  return (
    <h3
      className={clsx(
        "text-lg font-semibold text-slate-800 dark:text-slate-100",
        className
      )}
    >
      {children}
    </h3>
  );
}

/**
 * Main card content area
 */
export function CardContent({ className, children }) {
  return (
    <div className={clsx("p-4", className)}>
      {children}
    </div>
  );
}
