import type { Preset } from "@/lib/presets/schema";
import { Field, Select } from "./fields";

// One-click templates (spec: Presets and recipes): picking one fills the
// scene, camera and frame; the cast stays the visitor's own.
export function PresetPicker({ presets, value, onPick }: { presets: readonly Preset[]; value: string | undefined; onPick: (preset: Preset | undefined) => void }) {
  return (
    <Field label="Preset" hint="Fills in the scene and camera. Your cast stays yours.">
      {(id) => (
        <Select
          id={id}
          value={value}
          placeholder="None"
          options={presets.map((p) => ({ value: p.id, label: p.title }))}
          onChange={(v) => onPick(presets.find((p) => p.id === v))}
        />
      )}
    </Field>
  );
}
