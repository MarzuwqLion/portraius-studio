import { useId, useState } from "react";
import { useNavigate } from "react-router";
import { Badge } from "@/components/studio/Badge";
import { JobTake } from "@/components/studio/JobTake";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { goodPhotos, pickedViews, saveFromDraft } from "@/lib/characters/create";
import type { WizardDraft } from "@/lib/characters/draft";
import { VIEW_LABEL } from "@/lib/characters/sheet";
import type { UpdateDraft } from "./useDraft";

const parseTags = (text: string) =>
  [...new Set(text.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20).map((t) => t.slice(0, 40));

// Step 4: name, the description that goes into prompts, and tags.
export function DescribeStep({ draft, update, onNext }: { draft: WizardDraft; update: UpdateDraft; onNext: () => void }) {
  const ids = { name: useId(), description: useId(), tags: useId() };
  const [tags, setTags] = useState(draft.tags.join(", "));
  return (
    <form
      className="grid max-w-[70ch] gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        update({ tags: parseTags(tags) });
        onNext();
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor={ids.name}>Name</Label>
        <Input id={ids.name} value={draft.name} maxLength={80} onChange={(e) => update({ name: e.target.value })} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={ids.description}>Description</Label>
        <p className="text-control text-ink-muted">Goes into every prompt with this character: what doesn't show in a face, like build, style or a usual outfit.</p>
        <textarea
          id={ids.description}
          value={draft.description}
          maxLength={2000}
          rows={4}
          onChange={(e) => update({ description: e.target.value })}
          className="w-full rounded-control border border-rule bg-proof p-3 text-body text-ink"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={ids.tags}>Tags</Label>
        <Input id={ids.tags} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="lead, noir, pilot" />
      </div>
      <Button type="submit" disabled={!draft.name.trim()} className="justify-self-start">
        Continue
      </Button>
    </form>
  );
}

// Step 5: review and save.
export function SaveStep({ draft }: { draft: WizardDraft }) {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const picks = pickedViews(draft);

  async function save() {
    setSaving(true);
    setError(undefined);
    try {
      const record = await saveFromDraft(draft);
      navigate(`/characters/${record.id}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <h2 className="font-display text-screen font-extrabold">{draft.name}</h2>
        <div className="flex flex-wrap gap-2">
          <Badge>{draft.path === "photos" ? `From ${goodPhotos(draft).length} photos` : "Designed"}</Badge>
          {draft.consent ? <Badge>Consent on file</Badge> : null}
          {draft.tags.map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
        </div>
        {draft.description && <p className="max-w-[70ch] text-body">{draft.description}</p>}
      </div>
      {picks && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(Object.keys(picks) as (keyof typeof picks)[]).map((view) => (
            <JobTake key={view} jobId={picks[view]} alt={`${VIEW_LABEL[view]} view of ${draft.name}`} aspect={view === "fullBody" ? "9 / 16" : "4 / 5"} />
          ))}
        </div>
      )}
      {error && (
        <p className="text-control text-drift" role="alert">
          {error}
        </p>
      )}
      <Button onClick={() => void save()} disabled={saving || !picks} className="justify-self-start">
        {saving ? "Saving" : "Save character"}
      </Button>
    </div>
  );
}
