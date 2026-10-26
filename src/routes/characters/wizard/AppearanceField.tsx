import { Field, Segmented } from "@/components/studio/fields";
import { Input } from "@/components/ui/input";
import type { WizardDraft } from "@/lib/characters/draft";
import type { Appearance } from "@/lib/types/records";
import type { UpdateDraft } from "./useDraft";

const OPTIONS: { value: Appearance; label: string }[] = [
  { value: "real", label: "Real person" },
  { value: "animated", label: "Animated" },
];

// The first choice on both person paths: a real-looking person (the
// default) or an animated character, with an optional art style that every
// sheet view and later shot keeps.
export function AppearanceField({ draft, update }: { draft: WizardDraft; update: UpdateDraft }) {
  const appearance = draft.appearance ?? "real";
  return (
    <div className="grid max-w-md gap-3">
      <h2 className="text-panel font-semibold">How should they look?</h2>
      <Segmented label="Real or animated" value={appearance} onChange={(v) => update({ appearance: v })} options={OPTIONS} />
      {appearance === "animated" && (
        <Field label="Art style" hint="Optional. Every view and every shot keeps this style.">
          {(id) => (
            <Input
              id={id}
              value={draft.artStyle ?? ""}
              onChange={(e) => update({ artStyle: e.target.value })}
              maxLength={200}
              placeholder="Hand-drawn anime with soft watercolour colouring"
            />
          )}
        </Field>
      )}
    </div>
  );
}
