import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// A quiet label on proof: origin, consent and lock states.
export function Badge({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "warning" }) {
  return (
    <span className={cn("inline-flex h-6 items-center rounded-control border px-2 text-control font-semibold", tone === "warning" ? "border-drift text-drift" : "border-rule text-ink")}>
      {children}
    </span>
  );
}
