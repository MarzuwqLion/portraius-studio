import { Field, Select } from "@/components/studio/fields";
import { CAMERA, LOOKS } from "@/lib/presets/load";
import type { CameraGroup } from "@/lib/presets/schema";
import type { CameraSelection } from "@/lib/prompts/camera";

const LABEL: Record<CameraGroup, string> = {
  genre: "Genre",
  body: "Camera",
  era: "Era",
  pacing: "Pacing",
  size: "Shot size",
  angle: "Angle",
  lens: "Lens",
  aperture: "Aperture",
  movement: "Movement",
  lighting: "Lighting",
};

// Camera and look presets (shared with Director). Each studio shows the groups
// that make sense for it.
export function CameraPicker({
  groups,
  value,
  onChange,
  withLook = true,
}: {
  groups: CameraGroup[];
  value: CameraSelection;
  onChange: (value: CameraSelection) => void;
  withLook?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {groups.map((group) => (
        <Field key={group} label={LABEL[group]}>
          {(id) => (
            <Select
              id={id}
              value={value[group]}
              placeholder="Any"
              options={CAMERA[group].map((o) => ({
                value: o.id,
                label: o.label,
              }))}
              onChange={(v) => onChange({ ...value, [group]: v })}
            />
          )}
        </Field>
      ))}
      {withLook && (
        <Field label="Look">
          {(id) => (
            <Select
              id={id}
              value={value.look}
              placeholder="Natural"
              options={LOOKS.map((l) => ({ value: l.id, label: l.label }))}
              onChange={(v) => onChange({ ...value, look: v })}
            />
          )}
        </Field>
      )}
    </div>
  );
}
