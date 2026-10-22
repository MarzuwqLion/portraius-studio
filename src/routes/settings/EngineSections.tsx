// Settings for the local engine (spec: Local engine): the visitor's ComfyUI,
// the model files it has, "Never spend credits" and a default per feature.
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FEATURES, FEATURE_LABEL, featureOptions } from "@/lib/registry/availability";
import { missingFiles, localModelFiles } from "@/lib/registry/local-models";
import { REGISTRY } from "@/lib/registry/models";
import { reachOf, saveDefaultModel, saveLocal, saveNeverSpend, useEngineStore, verifyLocal } from "@/lib/session/engine";
import { useKeyStore } from "@/lib/session/key";

const SETUP_GUIDE = "https://github.com/MarzuwqLion/portraius-studio/blob/main/docs/local-setup.md";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-rule pt-6">
      <h2 className="text-panel font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const LOCAL_MODELS = REGISTRY.filter((e) => e.backend === "local");

function ModelFiles() {
  const info = useEngineStore((s) => s.info);
  if (!info) return null;
  return (
    <ul className="grid gap-3">
      {LOCAL_MODELS.map((model) => {
        const missing = missingFiles(model.id, info.installed);
        const gb = localModelFiles(model.id).reduce((sum, f) => sum + f.gb, 0);
        return (
          <li key={model.id} className="grid gap-1">
            <p className="text-body">
              <strong>{model.label}</strong>{" "}
              {missing.length ? (
                <span className="text-drift">missing {missing.length} of {localModelFiles(model.id).length} files</span>
              ) : (
                <span className="text-match">ready</span>
              )}
              <span className="text-ink-muted"> · about {Math.round(gb)} GB</span>
            </p>
            {missing.length > 0 && (
              <ul className="grid gap-0.5 pl-4 text-control">
                {missing.map((f) => (
                  <li key={`${f.folder}/${f.name}`}>
                    <code>models/{f.folder}/</code>{" "}
                    <a href={f.url} target="_blank" rel="noreferrer" className="text-accent-text underline underline-offset-4">
                      {f.name}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function LocalSection() {
  const { localEnabled, localUrl, check, info, error } = useEngineStore();
  const [draft, setDraft] = useState(localUrl);
  const enabledId = useId();
  const urlId = useId();
  useEffect(() => setDraft(localUrl), [localUrl]);
  const origin = window.location.origin;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await saveLocal({ url: draft });
  }

  return (
    <Section title="Your ComfyUI">
      <p className="max-w-[70ch] text-body">
        Run open-weight models on your own GPU for free: Qwen for characters and images, Wan for video and Recast. Start ComfyUI with{" "}
        <code>--enable-cors-header {origin}</code> and add the model files below. The{" "}
        <a href={SETUP_GUIDE} target="_blank" rel="noreferrer" className="font-semibold text-accent-text underline underline-offset-4">
          setup guide
        </a>{" "}
        has every step. Nothing you make leaves your computer.
      </p>
      <div className="flex items-center gap-2">
        <Checkbox id={enabledId} checked={localEnabled} onCheckedChange={(v) => void saveLocal({ enabled: v === true })} />
        <Label htmlFor={enabledId} className="font-normal">
          Use my ComfyUI
        </Label>
      </div>
      {localEnabled && (
        <>
          <form onSubmit={onSubmit} className="grid gap-3">
            <Label htmlFor={urlId}>Its address</Label>
            <div className="flex flex-wrap gap-2">
              <Input id={urlId} value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} className="max-w-sm" />
              <Button type="submit" variant="secondary" disabled={check === "checking"}>
                {draft.trim().replace(/\/+$/, "") === localUrl ? "Check again" : "Save and check"}
              </Button>
            </div>
          </form>
          <p className="text-body" role="status">
            {check === "checking" && "Checking your ComfyUI."}
            {check === "ok" && info && `Connected${info.version ? ` to ComfyUI ${info.version}` : ""}${info.gpu ? ` on ${info.gpu.replace(/^cuda:\d+\s*/, "")}` : ""}${info.vramGb ? ` (${info.vramGb} GB)` : ""}.`}
          </p>
          {check === "unreachable" && error && (
            <p className="max-w-[70ch] text-body text-drift" role="alert">
              {error} From this page, only an address on this computer works (127.0.0.1 or localhost).
            </p>
          )}
          {check === "ok" && <ModelFiles />}
          {check === "ok" && (
            <Button type="button" variant="ghost" className="justify-self-start" onClick={() => void verifyLocal()}>
              Look for new files
            </Button>
          )}
        </>
      )}
    </Section>
  );
}

export function WhereSection() {
  const engine = useEngineStore();
  const hasKey = useKeyStore((s) => s.location !== "none");
  const neverSpendId = useId();
  const reach = reachOf(engine, hasKey);
  if (!engine.localEnabled && !engine.neverSpend) return null;
  return (
    <Section title="Where things run">
      <div className="flex items-start gap-3">
        <Checkbox id={neverSpendId} checked={engine.neverSpend} onCheckedChange={(v) => void saveNeverSpend(v === true)} className="mt-0.5" />
        <Label htmlFor={neverSpendId} className="max-w-[70ch] font-normal">
          Never spend credits: hide every model that runs on Comfy, even with a key saved
        </Label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {FEATURES.map((feature) => {
          const options = featureOptions(feature, reach);
          if (!options.length) return null;
          const value = engine.defaults[feature] && options.some((o) => o.id === engine.defaults[feature]) ? engine.defaults[feature] : "";
          return (
            <label key={feature} className="grid gap-1.5">
              <span className="text-control font-semibold">{FEATURE_LABEL[feature]}</span>
              <select
                value={value}
                onChange={(e) => void saveDefaultModel(feature, e.target.value)}
                className="h-10 w-full rounded-control border border-rule bg-proof px-3 text-body text-ink"
              >
                <option value="">Automatic</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label} · {o.backend === "local" ? "your GPU" : "Comfy credits"}
                    {o.blocked ? " (not ready)" : ""}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </Section>
  );
}
