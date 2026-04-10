"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "../lib/theme";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Przełącz na tryb jasny" : "Przełącz na tryb ciemny"}
      aria-pressed={isDark}
      title={isDark ? "Tryb jasny" : "Tryb ciemny"}
      className="flex h-10 w-10 items-center justify-center rounded-full text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}
