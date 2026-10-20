import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Button } from "@/components/ui/button";
import { recipeToPreset, remixLink } from "@/lib/recipes/share";
import { recipeForGeneration } from "@/lib/studio/remix";

// "Copy remix link" and "Save as preset" for a finished take (spec: Remix
// links). Nothing shows for takes that can't be shared (edits, Recast).
export function RemixActions({ generationId, className }: { generationId: string; className?: string }) {
  const recipe = useLiveQuery(() => recipeForGeneration(generationId), [generationId]);
  const [copied, setCopied] = useState<"copied" | "failed">();
  if (!recipe) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(await remixLink(recipe!));
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
    setTimeout(() => setCopied(undefined), 2500);
  }

  function save() {
    const words = recipe!.prompt.replace(/\{[a-z][a-z0-9_-]*\}/gi, "").replace(/\s+/g, " ").trim().split(" ").slice(0, 5).join(" ");
    const preset = recipeToPreset(recipe!, words ? words.charAt(0).toUpperCase() + words.slice(1) : "My preset");
    const url = URL.createObjectURL(new Blob([JSON.stringify(preset, null, 2) + "\n"], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${preset.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return (
    <div className={className ?? "flex flex-wrap gap-2"}>
      <Button size="sm" variant="secondary" onClick={() => void copy()}>
        {copied === "copied" ? "Link copied" : copied === "failed" ? "Couldn't copy" : "Copy remix link"}
      </Button>
      <Button size="sm" variant="secondary" onClick={save}>
        Save as preset
      </Button>
    </div>
  );
}
