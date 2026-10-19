import * as React from "react";
import { cn } from "@/lib/utils";

// shadcn/ui input, restyled to the studio tokens.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-control border border-rule bg-proof px-3 text-body text-ink placeholder:text-ink-muted disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-drift",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
