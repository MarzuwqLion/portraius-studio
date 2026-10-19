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

// Work screens: the call sheet (controls) on proof, the set (media) on Studio grey.
export function WorkScreen({ title, callSheet, set }: { title: ReactNode; callSheet: ReactNode; set: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <section aria-label="Call sheet" className="shrink-0 overflow-auto border-rule p-6 md:w-80 md:border-r">
        <ScreenTitle className="mb-6">{title}</ScreenTitle>
        {callSheet}
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
