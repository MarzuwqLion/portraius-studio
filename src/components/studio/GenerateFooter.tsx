import { useEffect, useId, useRef, type ReactNode } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import type { Price } from "@/lib/jobs/hooks";
import { useKeyStore } from "@/lib/session/key";

// The Generate footer (spec: Decisions, October 21, item 1): the primary
// action, its price and what it's waiting for, pinned under the call sheet so
// it never needs scrolling to find. Cmd/Ctrl+Enter runs it from anywhere on
// the screen, the prompt included.
export function GenerateFooter({
  label,
  price,
  waitingFor,
  busy = false,
  onRun,
  note,
  local = false,
}: {
  label: string;
  price: Price;
  waitingFor?: string;     // why the button is disabled, e.g. "Write a prompt"
  busy?: boolean;
  onRun: () => void;
  note?: ReactNode;        // one quiet line under the button
  local?: boolean;         // runs only on the visitor's ComfyUI, so it needs no key
}) {
  const reasonId = useId();
  // With everything else ready, the last thing missing is often the key: a
  // visitor from the Tour has none yet.
  const noKey = useKeyStore((s) => s.location === "none");
  const needsKey = !waitingFor && noKey && !local;
  const disabled = Boolean(waitingFor) || needsKey || busy;
  const run = useRef(onRun);
  run.current = onRun;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        if (!disabled) run.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [disabled]);

  return (
    <div className="grid gap-1.5">
      {waitingFor && (
        <p id={reasonId} className="text-control font-semibold">
          {waitingFor}
        </p>
      )}
      {needsKey && (
        <p id={reasonId} className="text-control font-semibold">
          <Link to="/settings" className="text-accent-text underline underline-offset-4">
            Add your Comfy API key
          </Link>{" "}
          to run it
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="button" className="flex-1" disabled={disabled} aria-describedby={waitingFor || needsKey ? reasonId : undefined} aria-keyshortcuts="Control+Enter Meta+Enter" onClick={onRun}>
          {label}
        </Button>
        {price.label && <span className="shrink-0 text-body font-semibold tabular-nums">{price.label}</span>}
      </div>
      {price.state === "unavailable" && !waitingFor && <p className="text-control text-ink-muted">Prices aren't available for this key; Comfy bills your account as usual.</p>}
      {note && <p className="text-control text-ink-muted">{note}</p>}
    </div>
  );
}
