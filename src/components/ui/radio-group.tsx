import * as React from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

// shadcn/ui radio group, restyled as a segmented control on the studio tokens.
function RadioGroup({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("inline-flex rounded-control border border-rule p-0.5", className)}
      {...props}
    />
  );
}

function RadioGroupItem({ className, children, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "h-8 rounded-[4px] px-3 text-control font-semibold text-ink hover:bg-tint-hover data-[state=checked]:bg-ink data-[state=checked]:text-on-ink",
        className,
      )}
      {...props}
    >
      {children}
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupItem };
