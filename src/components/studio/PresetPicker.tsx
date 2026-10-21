import type { Preset } from "@/lib/presets/schema";
import { PresetTiles } from "./PresetTiles";

// One-click templates (spec: Presets and recipes): picking one fills the
// scene, camera and frame; the cast stays the visitor's own. Picking the
// picked tile again clears it.
export function PresetPicker({ presets, value, onPick }: { presets: readonly Preset[]; value: string | undefined; onPick: (preset: Preset | undefined) => void }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-control font-semibold">Preset</span>
      <PresetTiles presets={presets} value={value} onPick={onPick} label="Presets" />
      <p className="text-control text-ink-muted">Fills in the scene and camera. Your cast stays yours.</p>
    </div>
  );
}
