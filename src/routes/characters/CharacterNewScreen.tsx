import { Link, useSearchParams } from "react-router";
import { Screen } from "@/components/shell/Screen";
import { Button } from "@/components/ui/button";
import type { CreatePath } from "@/lib/characters/draft";
import { useKeyStore } from "@/lib/session/key";
import { cn } from "@/lib/utils";
import { ConsentStep } from "./wizard/ConsentStep";
import { DesignStep, PickStep } from "./wizard/DesignSteps";
import { DescribeStep, SaveStep } from "./wizard/FinishSteps";
import { PhotosStep } from "./wizard/PhotosStep";
import { SheetStep } from "./wizard/SheetStep";
import { useDraft } from "./wizard/useDraft";

const STEPS: Record<CreatePath, string[]> = {
  photos: ["Photos", "Consent", "Sheet", "Describe", "Save"],
  text: ["Design", "Pick", "Sheet", "Describe", "Save"],
};

// Steps that send work to Router.
const NEEDS_KEY: Record<CreatePath, number[]> = { photos: [2], text: [0, 1, 2] };

function Chooser() {
  return (
    <Screen title="Make a character">
      <div className="grid max-w-4xl gap-4 md:grid-cols-2">
        <Link to="?from=photos" className="grid gap-2 rounded-media border border-rule p-6 hover:bg-tint-hover">
          <span className="text-panel font-semibold">From your photos</span>
          <span className="text-body text-ink-muted">3 to 10 photos of yourself and a short webcam check. About two minutes.</span>
        </Link>
        <Link to="?from=text" className="grid gap-2 rounded-media border border-rule p-6 hover:bg-tint-hover">
          <span className="text-panel font-semibold">Design from a description</span>
          <span className="text-body text-ink-muted">An original person who isn't real. No photos and no camera needed.</span>
        </Link>
      </div>
    </Screen>
  );
}

function Stepper({ labels, current }: { labels: string[]; current: number }) {
  return (
    <ol className="mb-8 flex flex-wrap gap-x-6 gap-y-2" aria-label="Steps">
      {labels.map((label, i) => (
        <li key={label} aria-current={i === current ? "step" : undefined} className={cn("flex items-baseline gap-2", i === current ? "text-ink" : "text-ink-muted")}>
          <span className="font-display text-panel font-extrabold">{i + 1}</span>
          <span className={cn("text-body", i === current && "font-semibold")}>{label}</span>
        </li>
      ))}
    </ol>
  );
}

function Wizard({ path }: { path: CreatePath }) {
  const { draft, update, reset } = useDraft(path);
  const keyLocation = useKeyStore((s) => s.location);
  if (!draft) return <Screen title="Make a character" />;

  const step = Math.min(draft.step, STEPS[path].length - 1);
  const go = (next: number) => update({ step: next });
  const needsKey = keyLocation === "none" && NEEDS_KEY[path].includes(step);
  const props = { draft, update, onNext: () => go(step + 1) };

  return (
    <Screen
      title={path === "photos" ? "Make a character from photos" : "Design a character"}
      actions={
        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="ghost" onClick={() => go(step - 1)}>
              Back
            </Button>
          )}
          <Button variant="secondary" onClick={() => void reset()}>
            Start over
          </Button>
        </div>
      }
    >
      <Stepper labels={STEPS[path]} current={step} />
      {needsKey && (
        <p className="mb-6 max-w-[70ch] text-body">
          This step draws with Nano Banana 2.1, which needs your Comfy API key.{" "}
          <Link to="/settings" className="font-semibold underline underline-offset-4">
            Add it in Settings
          </Link>
          , then come back. Your progress is kept.
        </p>
      )}
      {path === "photos" ? (
        <>
          {step === 0 && <PhotosStep {...props} />}
          {step === 1 && <ConsentStep {...props} />}
        </>
      ) : (
        <>
          {step === 0 && <DesignStep {...props} />}
          {step === 1 && <PickStep {...props} onBack={() => go(0)} />}
        </>
      )}
      {step === 2 && <SheetStep {...props} />}
      {step === 3 && <DescribeStep {...props} />}
      {step === 4 && <SaveStep draft={draft} />}
    </Screen>
  );
}

export function CharacterNewScreen() {
  const [params] = useSearchParams();
  const from = params.get("from");
  if (from !== "photos" && from !== "text") return <Chooser />;
  // A key per path, so switching paths starts that path's own draft.
  return <Wizard key={from} path={from} />;
}
