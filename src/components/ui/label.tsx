import * as React from "react";
import { Label as LabelPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

// shadcn/ui label, restyled to the studio tokens.
function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn("flex items-center gap-2 text-control font-semibold text-ink select-none peer-disabled:opacity-50", className)}
      {...props}
    />
  );
}

export { Label };
