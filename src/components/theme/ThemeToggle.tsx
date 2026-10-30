"use client";

import { useRef } from "react";
import { useTheme } from "./ThemeProvider";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const { theme, toggleTheme, isTransitioning } = useTheme();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const isDark = theme === "dark";

  const handleClick = () => {
    toggleTheme(buttonRef.current);
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleClick}
      disabled={isTransitioning}
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      title={
        isDark
          ? "Cambiar a modo claro (Circular Reveal)"
          : "Cambiar a modo oscuro (Circular Reveal)"
      }
      className="relative p-2 sm:px-3 sm:py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-xs flex items-center gap-1.5 cursor-pointer disabled:cursor-wait transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40"
    >
      <div className="relative w-4 h-4 flex items-center justify-center shrink-0">
        <Sun
          className={`h-4 w-4 text-amber-500 absolute transition-all duration-300 ${
            isDark
              ? "rotate-0 scale-100 opacity-100"
              : "-rotate-90 scale-0 opacity-0"
          }`}
        />
        <Moon
          className={`h-4 w-4 text-slate-600 dark:text-slate-300 absolute transition-all duration-300 ${
            isDark
              ? "rotate-90 scale-0 opacity-0"
              : "rotate-0 scale-100 opacity-100"
          }`}
        />
      </div>
      <span className="hidden xl:inline text-xs font-semibold select-none">
        {isDark ? "Modo Claro" : "Modo Oscuro"}
      </span>
    </button>
  );
}
