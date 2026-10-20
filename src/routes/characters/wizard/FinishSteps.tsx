import { useId, useState } from "react";
import { useNavigate } from "react-router";
import { Badge } from "@/components/studio/Badge";
import { JobTake } from "@/components/studio/JobTake";
import { VoicePicker } from "@/components/studio/VoicePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { goodPhotos, pickedViews, saveFromDraft } from "@/lib/characters/create";
import type { WizardDraft } from "@/lib/characters/draft";
import { ELEMENT_TYPE_LABEL } from "@/lib/characters/element-sheet";
import { viewAspect, viewLabel } from "@/lib/characters/sheet";
import type { UpdateDraft } from "./useDraft";

const parseTags = (text: string) =>
  [...new Set(text.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20).map((t) => t.slice(0, 40));

// Step 4: name, the description that goes into prompts, tags, and for a
// person an optional stock voice.
export function DescribeStep({ draft, update, onNext }: { draft: WizardDraft; update: UpdateDraft; onNext: () => void }) {
  const ids = { name: useId(), description: useId(), tags: useId(), voice: useId() };
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
        <p className="text-control text-ink-muted">
          {draft.path === "element"
            ? "Goes into every prompt with this element: what it's made of and anything the pictures don't show."
            : "Goes into every prompt with this character: what doesn't show in a face, like build, style or a usual outfit."}
        </p>
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
        <Input id={ids.tags} value={tags} onChange={(e) => setTags(e.target.value)} placeholder={draft.path === "element" ? "wardrobe, noir, 1970s" : "lead, noir, pilot"} />
      </div>
      {draft.path !== "element" && (
        <div className="grid gap-2">
          <Label htmlFor={ids.voice}>Voice (optional)</Label>
          <p className="text-control text-ink-muted">A stock voice for this character&apos;s lines. You can change it later.</p>
          <VoicePicker
            id={ids.voice}
            value={draft.voiceId}
            placeholder="No voice yet"
            onChange={(voiceId) => update(voiceId ? { voiceId } : { voiceId: undefined })}
          />
        </div>
      )}
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
  const elementType = draft.path === "element" ? (draft.elementType ?? "prop") : undefined;

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
          {elementType && <Badge>{ELEMENT_TYPE_LABEL[elementType]}</Badge>}
          <Badge>{draft.path === "text" ? "Designed" : `From ${goodPhotos(draft).length} ${goodPhotos(draft).length === 1 ? "photo" : "photos"}`}</Badge>
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
            <JobTake key={view} jobId={picks[view]} alt={`${viewLabel(view, elementType)} view of ${draft.name}`} aspect={viewAspect(view, elementType)} />
          ))}
        </div>
      )}
      {error && (
        <p className="text-control text-drift" role="alert">
          {error}
        </p>
      )}
      <Button onClick={() => void save()} disabled={saving || !picks} className="justify-self-start">
        {saving ? "Saving" : elementType ? "Save element" : "Save character"}
      </Button>
    </div>
  );
}
