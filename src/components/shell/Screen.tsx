import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ScreenTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h1 className={cn("font-display text-screen font-extrabold", className)}>{children}</h1>;
}

// A plain screen: title, then content on proof.
export function Screen({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-end justify-between gap-4 px-6 pt-6 pb-4">
        <ScreenTitle>{title}</ScreenTitle>
        {actions}
      </header>
      <div className="flex-1 px-6 pb-8">{children}</div>
    </div>
  );
}

// Work screens: the call sheet (controls) on proof, the set (media) on Studio
// grey. The footer (the Generate button) stays pinned under the call sheet
// while the controls scroll above it.
export function WorkScreen({ title, callSheet, footer, set }: { title: ReactNode; callSheet: ReactNode; footer?: ReactNode; set: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <section aria-label="Call sheet" className="flex shrink-0 flex-col border-rule md:min-h-0 md:w-80 md:border-r xl:w-96">
        <div className="p-6 md:min-h-0 md:flex-1 md:overflow-auto">
          <ScreenTitle className="mb-6">{title}</ScreenTitle>
          {callSheet}
        </div>
        {footer && <div className="sticky bottom-0 border-t border-rule bg-proof px-6 py-4">{footer}</div>}
      </section>
      <section aria-label="Set" className="flex min-h-64 flex-1 items-center justify-center bg-seamless p-6 text-on-seamless">
        {set}
      </section>
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="max-w-[70ch] text-body text-ink-muted">{children}</p>;
}
