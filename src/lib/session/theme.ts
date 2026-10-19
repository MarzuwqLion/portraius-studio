import type { Settings } from "@/lib/types/records";

// "system" removes the attribute so tokens.css follows prefers-color-scheme.
export function applyTheme(theme: Settings["theme"]): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}
