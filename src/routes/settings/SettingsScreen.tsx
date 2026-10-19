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
        Your key stays in this browser and is sent only to <strong>{routerHost}</strong>. Get one with Router access at{" "}
        <a href="https://platform.comfy.org" target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-4">
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

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function StorageSection() {
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  const [credits, setCredits] = useState(0);
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
      <p className="text-body">Spent this session: {credits.toFixed(2)} credits.</p>
    </Section>
  );
}

export function SettingsScreen() {
  return (
    <Screen title="Settings">
      <div className="grid max-w-2xl gap-10">
        <KeySection />
        <ThemeSection />
        <StorageSection />
        {DayOneChecks && (
          <Suspense fallback={null}>
            <DayOneChecks />
          </Suspense>
        )}
      </div>
    </Screen>
  );
}
