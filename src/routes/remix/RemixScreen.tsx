import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Note, Screen } from "@/components/shell/Screen";
import { PresetExample, THUMBNAIL_CAST } from "@/components/studio/EmptyExample";
import { Field, Select } from "@/components/studio/fields";
import { PromptText } from "@/components/studio/PromptEditor";
import { Button, buttonVariants } from "@/components/ui/button";
import { useEstimateLabel } from "@/lib/jobs/hooks";
import { withPrice } from "@/lib/jobs/estimate";
import { IMAGE_PRESETS, VIDEO_PRESETS, cameraOption, look, thumbnailUrl } from "@/lib/presets/load";
import { CAMERA_GROUPS, type CameraGroup } from "@/lib/presets/schema";
import { decodeRecipe, type RecipeFile } from "@/lib/recipes/share";
import { featureOptions } from "@/lib/registry/availability";
import { MODEL_IDS, isLocalModel, registryEntry } from "@/lib/registry/models";
import { reachOf, useEngineStore, useFeatureModels } from "@/lib/session/engine";
import { useKeyStore } from "@/lib/session/key";
import { isUsable } from "@/lib/store/characters";
import { useCharacters } from "@/lib/store/hooks";
import { matchingPreset, startRemix } from "@/lib/studio/remix";
import { modelFor, type VideoMode } from "@/lib/studio/video";

// A shared recipe (spec: Remix links): its card, a picker per slot filled
// from the visitor's own vault, then one click to run.
export function RemixScreen() {
  const [params] = useSearchParams();
  const encoded = params.get("r");
  const [recipe, setRecipe] = useState<RecipeFile>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    setRecipe(undefined);
    setError(undefined);
    if (encoded) decodeRecipe(encoded).then(setRecipe, (err: Error) => setError(err.message));
  }, [encoded]);

  return (
    <Screen title="Remix">
      {!encoded && <Note>Open a remix link to fill its slots with your own characters.</Note>}
      {error && (
        <p role="alert" className="text-body text-drift">
          {error}
        </p>
      )}
      {recipe && <RecipeCard recipe={recipe} />}
    </Screen>
  );
}

function RecipeCard({ recipe }: { recipe: RecipeFile }) {
  const navigate = useNavigate();
  const characters = useCharacters();
  const usable = (characters ?? []).filter(isUsable);
  const [picks, setPicks] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const image = recipe.capability === "image.generate";
  // A recipe from a shipped preset shows that preset's own example.
  const example = matchingPreset(recipe, image ? IMAGE_PRESETS : VIDEO_PRESETS);

  // Fill each slot with the first unused character of its kind.
  useEffect(() => {
    if (!characters) return;
    setPicks((current) => {
      const next = { ...current };
      const used = new Set(Object.values(next));
      for (const slot of recipe.slots) {
        if (next[slot.slot]) continue;
        const match = usable.find((c) => c.kind === slot.kind && !used.has(c.id));
        if (match) {
          next[slot.slot] = match.id;
          used.add(match.id);
        }
      }
      return next;
    });
  }, [characters, recipe]);

  const cast = recipe.slots.flatMap((s) => (picks[s.slot] ? [{ slot: s.slot, characterId: picks[s.slot]! }] : []));
  const ready = cast.length === recipe.slots.length;
  const p = recipe.params ?? {};
  // The recipe's own model when it can run here; otherwise the visitor's own
  // for the feature, such as Qwen or Wan on their GPU (spec: Local engine).
  const feature = image ? "image" : "video";
  const engine = useEngineStore();
  const hasKey = useKeyStore((s) => s.location !== "none");
  const own = useFeatureModels(feature);
  const recipeRuns = featureOptions(feature, reachOf(engine, hasKey)).some((o) => o.id === recipe.model && !o.blocked);
  const chosen = recipeRuns ? recipe.model : own.modelId;
  const runModel = image ? chosen : modelFor({ mode: (p.mode as VideoMode) ?? "text", cast, model: chosen as Parameters<typeof modelFor>[0]["model"] }, false);
  const price = useEstimateLabel(
    runModel,
    ready
      ? async () =>
          image
            ? { prompt: recipe.prompt, references: [], aspectRatio: p.aspectRatio, size: p.size, quality: p.quality }
            : runModel === MODEL_IDS.minimaxH3
              ? { stage: "generate", prompt: recipe.prompt, durationSec: p.durationSec, ratio: p.ratio, resolution: p.h3Resolution ?? "768P" }
              : { stage: "draft", prompt: recipe.prompt, durationSec: p.durationSec, ratio: p.ratio, generateAudio: p.audio !== false }
      : undefined,
    `${runModel}:${ready}`,
  );

  const people = usable.filter((c) => c.kind === "person");
  const needsPerson = recipe.slots.some((s) => s.kind === "person");
  const camera = Object.entries(recipe.camera ?? {}).flatMap(([group, id]) => {
    const label = group === "look" ? look(id)?.label : (CAMERA_GROUPS as readonly string[]).includes(group) ? cameraOption(group as CameraGroup, id)?.label : undefined;
    return label ? [label] : [];
  });
  const settings = image
    ? [p.aspectRatio, p.size, p.quality === "fast" ? "Fast" : "Best"]
    : [p.mode === "still" ? "Still first" : p.mode === "references" ? "References" : "Text to video", typeof p.durationSec === "number" ? `${p.durationSec} s` : undefined, p.ratio];

  async function run() {
    if (!ready || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      navigate(`/${await startRemix(recipe, cast, recipeRuns ? undefined : own.modelId)}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="grid max-w-3xl gap-6">
      {example && thumbnailUrl(example) && (
        <figure className="grid justify-items-start gap-2 rounded-media bg-seamless p-4 text-on-seamless">
          <PresetExample preset={example} className="develop max-h-80 w-auto max-w-full rounded-media border border-rule object-contain" />
          <figcaption className="text-control">Example with {THUMBNAIL_CAST}, a designed character. Your cast fills the slots.</figcaption>
        </figure>
      )}
      <article className="grid gap-3 rounded-media border border-rule p-5">
        <p className="text-control font-semibold text-ink-muted">
          {image ? "Image" : "Video"} recipe · {registryEntry(recipe.model)?.label ?? recipe.model}
        </p>
        <p className="font-display text-panel font-extrabold">
          <PromptText text={recipe.prompt} />
        </p>
        <ul className="flex flex-wrap gap-2 text-control">
          {[...camera, ...settings].filter((l): l is string => typeof l === "string" && l !== "").map((label) => (
            <li key={label} className="rounded-control border border-rule px-2 py-0.5">
              {label}
            </li>
          ))}
        </ul>
        <p className="text-control text-ink-muted">A recipe holds no faces or photos. Your own characters fill its slots.</p>
        {!recipeRuns && (
          <p className="text-control">
            Made with {registryEntry(recipe.model)?.label ?? recipe.model}. Here it runs on {registryEntry(own.modelId)?.label ?? own.modelId}
            {isLocalModel(own.modelId) ? " on your GPU" : ""}, so the result can differ.
          </p>
        )}
      </article>

      {needsPerson && characters && !people.length ? (
        <div className="grid gap-3">
          <Note>This recipe needs a person, and your vault has none yet.</Note>
          <Link to="/characters/new" className={buttonVariants({ className: "justify-self-start" })}>
            Design a character
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {recipe.slots.map((slot) => {
            const taken = new Set(Object.entries(picks).filter(([s]) => s !== slot.slot).map(([, id]) => id));
            const options = usable.filter((c) => c.kind === slot.kind && !taken.has(c.id)).map((c) => ({ value: c.id, label: c.name }));
            return (
              <Field key={slot.slot} label={`{${slot.slot}}`} hint={slot.kind === "person" ? "A person from your vault" : "An element from your vault"}>
                {(id) => <Select id={id} value={picks[slot.slot]} placeholder={options.length ? "Pick one" : "None in your vault"} options={options} onChange={(v) => setPicks({ ...picks, [slot.slot]: v })} />}
              </Field>
            );
          })}
        </div>
      )}

      {error && (
        <p role="alert" className="text-body text-drift">
          {error}
        </p>
      )}
      <Button className="justify-self-start" disabled={!ready || busy} onClick={() => void run()}>
        {withPrice("Run this recipe", price)}
      </Button>
    </div>
  );
}
