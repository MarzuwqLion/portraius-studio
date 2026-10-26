import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { saveFile } from "@/lib/library/library";
import { canShareFile, shareFile } from "@/lib/media/share";
import { useGeneration } from "@/lib/store/hooks";
import { socialExport } from "@/lib/studio/social";
import { cn } from "@/lib/utils";

// "Export 9:16" for a clip, with the end card on by default and one click to
// turn off (spec: Remix links, Social export). A scored clip can carry its
// likeness on the end card, and a phone can share the result straight away.
export function SocialExport({ generationId, onSeamless = false, size = "default" }: { generationId: string; onSeamless?: boolean; size?: "sm" | "default" }) {
  const id = useId();
  const likenessId = useId();
  const generation = useGeneration(generationId);
  const scored = generation?.identityScore !== undefined && generation.scoreNote !== "stylised";
  const [endCard, setEndCard] = useState(true);
  const [likeness, setLikeness] = useState(true);
  const [progress, setProgress] = useState<number>();
  const [done, setDone] = useState<{ url: string; name: string; file: File }>();
  const [error, setError] = useState<string>();

  async function run() {
    setProgress(0);
    setError(undefined);
    try {
      const { blob, name } = await socialExport(generationId, { endCard, likeness: scored && likeness }, setProgress);
      if (done) URL.revokeObjectURL(done.url);
      setDone({ url: URL.createObjectURL(blob), name, file: new File([blob], name, { type: blob.type || "video/mp4" }) });
      saveFile(blob, name);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProgress(undefined);
    }
  }

  async function share() {
    if (!done) return;
    setError(undefined);
    await shareFile(done.file).catch((err: Error) => setError(err.message));
  }

  const text = onSeamless ? "text-on-seamless" : "text-ink";
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button size={size} variant="secondary" className={cn(onSeamless && "border-on-seamless text-on-seamless")} onClick={() => void run()} disabled={progress !== undefined}>
          {progress !== undefined ? `Exporting ${Math.round(progress * 100)}%` : "Export 9:16"}
        </Button>
        <label htmlFor={id} className={cn("flex items-center gap-2 text-control", text)}>
          <Checkbox id={id} checked={endCard} onCheckedChange={(v) => setEndCard(v === true)} className={cn(onSeamless && "border-on-seamless")} />
          End card: Made with Portraius Studio
        </label>
        {scored && (
          <label htmlFor={likenessId} className={cn("flex items-center gap-2 text-control", text, !endCard && "opacity-60")}>
            <Checkbox id={likenessId} checked={likeness} disabled={!endCard} onCheckedChange={(v) => setLikeness(v === true)} className={cn(onSeamless && "border-on-seamless")} />
            With its likeness score
          </label>
        )}
      </div>
      {done && (
        <div className="flex flex-wrap items-center gap-3">
          {canShareFile(done.file) && (
            <Button size="sm" onClick={() => void share()}>
              Share
            </Button>
          )}
          <a href={done.url} download={done.name} className={cn("text-control font-semibold underline underline-offset-4", text)}>
            Exported. Download it again
          </a>
        </div>
      )}
      {error && (
        <p className={cn("text-control text-drift", onSeamless && "justify-self-start rounded-control bg-proof px-2 py-1")} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
