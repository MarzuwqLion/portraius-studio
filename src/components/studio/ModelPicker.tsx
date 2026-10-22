import type { Feature } from "@/lib/registry/availability";
import { useFeatureModels } from "@/lib/session/engine";
import { Field } from "./fields";

// Where a feature runs (spec: Local engine, Where things run): the models it
// can use now, grouped "On your GPU, free" and "Comfy credits" when there are
// both. A pick becomes that feature's default. With one model there's nothing
// to pick, so nothing shows unless it can't run.
export function ModelPicker({ feature, label = "Model", hint }: { feature: Feature; label?: string; hint?: string }) {
  const { modelId, option, options, setModel } = useFeatureModels(feature);
  if (options.length < 2) {
    return option?.blocked ? <p className="text-control text-drift">{option.blocked}</p> : null;
  }
  const local = options.filter((o) => o.backend === "local");
  const router = options.filter((o) => o.backend === "router");
  const groups = local.length && router.length;
  const optionsFor = (list: typeof options) =>
    list.map((o) => (
      <option key={o.id} value={o.id}>
        {o.label}
        {o.blocked ? " (not ready)" : ""}
      </option>
    ));
  return (
    <Field label={label} {...(option?.blocked ? {} : hint ? { hint } : {})}>
      {(id) => (
        <>
          <select id={id} value={modelId} onChange={(e) => setModel(e.target.value)} className="h-10 w-full rounded-control border border-rule bg-proof px-3 text-body text-ink">
            {groups ? (
              <>
                <optgroup label="On your GPU, free">{optionsFor(local)}</optgroup>
                <optgroup label="Comfy credits">{optionsFor(router)}</optgroup>
              </>
            ) : (
              optionsFor(options)
            )}
          </select>
          {option?.blocked && <p className="text-control text-drift">{option.blocked}</p>}
        </>
      )}
    </Field>
  );
}
