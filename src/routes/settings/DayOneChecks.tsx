// Development builds only (lazy-loaded behind import.meta.env.DEV).
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useKeyStore } from "@/lib/session/key";
import { runDayOneChecks, type CheckResult } from "@/dev/day-one-checks";

const OUTCOME_TEXT = { pass: "Pass", fail: "Fail", info: "Note" } as const;

export default function DayOneChecks() {
  const location = useKeyStore((s) => s.location);
  const [results, setResults] = useState<CheckResult[]>([]);
  const [state, setState] = useState<"idle" | "running" | "saved" | "unsaved">("idle");

  async function run() {
    setResults([]);
    setState("running");
    const all: CheckResult[] = [];
    await runDayOneChecks((result) => {
      all.push(result);
      setResults([...all]);
    });
    const saved = await fetch("/__dev/m1-checks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ranAt: new Date().toISOString(), userAgent: navigator.userAgent, results: all }),
    })
      .then((r) => r.ok)
      .catch(() => false);
    setState(saved ? "saved" : "unsaved");
  }

  return (
    <section className="grid gap-4 border-t border-rule pt-6">
      <h2 className="text-panel font-semibold">Day-one checks (development only)</h2>
      <p className="max-w-[70ch] text-body">
        Runs the M1 checks with your key: one Nano Banana image, one 4 second Seedance draft, one skin enhance and one
        upload. Takes a few minutes and costs well under a dollar.
      </p>
      <div>
        <Button onClick={() => void run()} disabled={location === "none" || state === "running"}>
          {state === "running" ? "Running checks" : "Run checks"}
        </Button>
      </div>
      {state === "saved" && <p className="text-body">Results saved to .checks/m1-browser.json.</p>}
      {state === "unsaved" && <p className="text-body text-drift">Results couldn't be saved. Copy them from below.</p>}
      <ol className="grid gap-3">
        {results.map((r) => (
          <li key={r.id} className="border-t border-rule pt-3">
            <p className="text-body">
              <strong>{OUTCOME_TEXT[r.outcome]}</strong> · {r.title} · rows {r.rows} · {(r.ms / 1000).toFixed(1)} s
            </p>
            <pre className="mt-1 overflow-x-auto text-control whitespace-pre-wrap">{JSON.stringify(r.details, null, 2)}</pre>
          </li>
        ))}
      </ol>
    </section>
  );
}
