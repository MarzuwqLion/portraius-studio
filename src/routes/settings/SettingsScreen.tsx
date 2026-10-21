import { lazy, Suspense, useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Screen } from "@/components/shell/Screen";
import { config } from "@/lib/config";
import { onSessionCredits } from "@/lib/router/client";
import { errorText } from "@/lib/router/errors";
import { forgetKey, saveKey, useKeyStore, verifyKey } from "@/lib/session/key";
import { applyTheme } from "@/lib/session/theme";
import { useSettings } from "@/lib/store/hooks";
import { updateSettings } from "@/lib/store/settings";
import { deleteAllData } from "@/lib/store/wipe";
import type { Settings } from "@/lib/types/records";

// Development builds only: the M1 day-one checks. Never part of the shipped site.
const DayOneChecks = import.meta.env.DEV ? lazy(() => import("./DayOneChecks")) : null;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-rule pt-6">
      <h2 className="text-panel font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const KEY_LOCATION_TEXT = {
  none: "No key yet.",
  session: "A key is saved for this tab. It's cleared when the tab closes.",
  device: "A key is saved on this device until you forget it.",
} as const;

function KeySection() {
  const { location, check, error } = useKeyStore();
  const [draft, setDraft] = useState("");
  const [remember, setRemember] = useState(false);
  const inputId = useId();
  const rememberId = useId();
  const routerHost = new URL(config.routerBaseUrl).host;
  const workerHost = config.mediaHost === "worker" && config.workerUrl ? new URL(config.workerUrl).host : null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const key = draft;
    setDraft("");
    await saveKey(key, remember);
    await verifyKey();
  }

  return (
    <Section title="Comfy API key">
      <p className="max-w-[70ch] text-body">
        Your key stays in this browser and is sent only to <strong>{routerHost}</strong>
        {workerHost && (
          <>
            {" "}
            and to <strong>{workerHost}</strong>, Portraius Studio's upload Worker, which checks it with Comfy and never stores it
          </>
        )}
        . Get one with Router access at{" "}
        <a href="https://platform.comfy.org" target="_blank" rel="noreferrer" className="font-semibold text-accent-text underline underline-offset-4">
          platform.comfy.org
        </a>
        .
      </p>
      <p className="text-body" role="status">
        {KEY_LOCATION_TEXT[location]}
        {check === "checking" && " Checking it now."}
        {check === "ok" && " Comfy accepted it."}
      </p>
      {check === "invalid" && error && (
        <p className="text-body text-drift" role="alert">
          {errorText(error)}
        </p>
      )}
      <form onSubmit={onSubmit} className="grid gap-3">
        <Label htmlFor={inputId}>{location === "none" ? "Paste your key" : "Replace your key"}</Label>
        <Input
          id={inputId}
          type="password"
          name="comfy-api-key"
          autoComplete="off"
          spellCheck={false}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="comfyui-..."
        />
        <div className="flex items-center gap-2">
          <Checkbox id={rememberId} checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
          <Label htmlFor={rememberId} className="font-normal">
            Remember on this device
          </Label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!draft.trim()}>
            Save key
          </Button>
          {location !== "none" && (
            <>
              <Button type="button" variant="secondary" onClick={() => void verifyKey()} disabled={check === "checking"}>
                Check key
              </Button>
              <Button type="button" variant="secondary" onClick={() => void forgetKey()}>
                Forget key
              </Button>
            </>
          )}
        </div>
      </form>
    </Section>
  );
}

function ThemeSection() {
  const settings = useSettings();
  function onChange(value: string) {
    const theme = value as Settings["theme"];
    applyTheme(theme);
    void updateSettings({ theme });
  }
  return (
    <Section title="Theme">
      <RadioGroup value={settings.theme} onValueChange={onChange} aria-label="Theme">
        <RadioGroupItem value="system">Match system</RadioGroupItem>
        <RadioGroupItem value="light">Light</RadioGroupItem>
        <RadioGroupItem value="dark">Dark</RadioGroupItem>
      </RadioGroup>
    </Section>
  );
}

function GenerationSection() {
  const settings = useSettings();
  return (
    <Section title="Generation">
      <label className="flex max-w-[70ch] items-start gap-3 text-body">
        <Checkbox checked={settings.autoRetry} onCheckedChange={(v) => void updateSettings({ autoRetry: v === true })} className="mt-0.5" />
        <span>Retry an image once, automatically, when its identity score drifts under 60</span>
      </label>
      <label className="flex max-w-[70ch] items-start gap-3 text-body">
        <Checkbox checked={settings.keepDrafts} onCheckedChange={(v) => void updateSettings({ keepDrafts: v === true })} className="mt-0.5" />
        <span>Keep a video's 480p draft after its final renders</span>
      </label>
    </Section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function StorageSection() {
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  useEffect(() => {
    navigator.storage
      ?.estimate()
      .then((e) => setUsage({ used: e.usage ?? 0, quota: e.quota ?? 0 }))
      .catch(() => setUsage(null));
    return onSessionCredits(setCredits);
  }, []);
  return (
    <Section title="Storage and spend">
      <p className="text-body">
        {usage ? `Using ${formatBytes(usage.used)} of about ${formatBytes(usage.quota)} this browser allows.` : "Storage use isn't available in this browser."}
      </p>
      {credits !== null && <p className="text-body">Spent this session: {credits.toFixed(2)} credits.</p>}
    </Section>
  );
}

function DataSection() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function wipe() {
    setBusy(true);
    await forgetKey();
    await deleteAllData();
    window.location.replace(`${window.location.pathname}#/`);
    window.location.reload();
  }

  return (
    <Section title="Your data">
      <p className="max-w-[70ch] text-body">
        Everything Portraius Studio keeps is in this browser: characters with their face data and consent records, the library, and these
        settings. Export characters and takes you want to keep first.
      </p>
      {confirming ? (
        <div className="grid gap-3">
          <p className="max-w-[70ch] text-body">Delete every character, take and setting from this browser? This can't be undone.</p>
          <div className="flex gap-3">
            <Button variant="danger" onClick={() => void wipe()} disabled={busy}>
              Delete all data
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Keep it
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" className="justify-self-start" onClick={() => setConfirming(true)}>
          Delete all data
        </Button>
      )}
    </Section>
  );
}

export function SettingsScreen() {
  return (
    <Screen title="Settings">
      <div className="grid max-w-2xl gap-10">
        <KeySection />
        <ThemeSection />
        <GenerationSection />
        <StorageSection />
        <DataSection />
        {DayOneChecks && (
          <Suspense fallback={null}>
            <DayOneChecks />
          </Suspense>
        )}
      </div>
    </Screen>
  );
}
