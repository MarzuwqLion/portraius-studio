import { useId, useState } from "react";
import { JobTake } from "@/components/studio/JobTake";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { faceDescriptor, isAnimatedDraft, jobImage, lookOf, startCandidates } from "@/lib/characters/create";
import type { WizardDraft } from "@/lib/characters/draft";
import { CANDIDATE_COUNT, candidateInput } from "@/lib/characters/sheet";
import { useEstimateLabel } from "@/lib/jobs/hooks";
import { ModelPicker } from "@/components/studio/ModelPicker";
import { useFeatureModels } from "@/lib/session/engine";
import { AppearanceField } from "./AppearanceField";
import type { UpdateDraft } from "./useDraft";

export const MIN_DESCRIPTION = 10;

// Design from text, step 1: real or animated, then describe an original person.
export function DesignStep({ draft, update, onNext }: { draft: WizardDraft; update: UpdateDraft; onNext: () => void }) {
  const id = useId();
  const [text, setText] = useState(draft.personDescription);
  const [error, setError] = useState<string>();
  const [starting, setStarting] = useState(false);
  const valid = text.trim().length >= MIN_DESCRIPTION;
  const animated = isAnimatedDraft(draft);
  const look = lookOf(draft);
  const { modelId, option } = useFeatureModels("characters");
  const price = useEstimateLabel(modelId, valid ? async () => candidateInput(text, look) : undefined, valid ? text : "");

  async function draw() {
    setStarting(true);
    setError(undefined);
    try {
      const ids = await startCandidates(text, modelId, look);
      update({ personDescription: text.trim(), candidateJobIds: ids, pickedCandidateJobId: undefined, candidateDescriptor: undefined });
      onNext();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="grid max-w-[70ch] gap-8">
      <AppearanceField draft={draft} update={update} />
      <div className="grid gap-4">
        <h2 className="text-panel font-semibold">{animated ? "Describe an original character" : "Describe an original person"}</h2>
        <p className="text-body text-ink-muted">
          {animated
            ? `Not an existing or famous character. Age, build, hair, colours, features and outfit all help. You'll pick one of ${CANDIDATE_COUNT} faces.`
            : `Not a real or famous person. Age, build, hair, skin, features and style all help. You'll pick one of ${CANDIDATE_COUNT} faces.`}
        </p>
        <div className="grid gap-2">
          <Label htmlFor={id}>Description</Label>
          <textarea
            id={id}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              // Kept as typed, so leaving and coming back keeps the words.
              update({ personDescription: e.target.value });
            }}
            rows={4}
            maxLength={600}
            placeholder={
              animated
                ? "A girl of about twelve with a messy auburn braid, freckles and a yellow raincoat"
                : "A woman in her forties with a cropped silver bob, laugh lines and a rust corduroy jacket"
            }
            className="w-full rounded-control border border-rule bg-proof p-3 text-body text-ink placeholder:text-ink-muted"
          />
        </div>
        <ModelPicker feature="characters" label="Draw with" />
        {error && (
          <p className="text-control text-drift" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void draw()} disabled={!valid || starting || Boolean(option?.blocked)}>
            {price ? `Draw ${CANDIDATE_COUNT} faces · ${price} each` : `Draw ${CANDIDATE_COUNT} faces`}
          </Button>
          {draft.candidateJobIds.length > 0 && (
            <Button variant="secondary" onClick={onNext}>
              Back to the faces
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// Design from text, step 2: pick one of the candidate faces.
export function PickStep({ draft, update, onBack, onNext }: { draft: WizardDraft; update: UpdateDraft; onBack: () => void; onNext: () => void }) {
  const [checking, setChecking] = useState<string>();
  const [error, setError] = useState<string>();

  // An animated face isn't one the face checker can read, and isn't scored.
  const animated = isAnimatedDraft(draft);

  async function pick(jobId: string) {
    if (animated) {
      update({ pickedCandidateJobId: jobId, candidateDescriptor: undefined });
      return;
    }
    setChecking(jobId);
    setError(undefined);
    try {
      const image = await jobImage(jobId);
      const descriptor = image ? await faceDescriptor(image) : undefined;
      if (!descriptor) {
        setError("No clear face was found in that one. Pick another, or draw new faces.");
        return;
      }
      update({ pickedCandidateJobId: jobId, candidateDescriptor: descriptor });
    } catch {
      setError("The face checker couldn't run. Reload the page and try again.");
    } finally {
      setChecking(undefined);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h2 className="text-panel font-semibold">Pick a face</h2>
        <p className="max-w-[70ch] text-body text-ink-muted">{draft.personDescription}</p>
      </div>
      <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        {draft.candidateJobIds.map((jobId, i) => (
          <JobTake
            key={jobId}
            jobId={jobId}
            alt={`Candidate face ${i + 1}`}
            aspect="4 / 5"
            seed={i + 3}
            picked={draft.pickedCandidateJobId === jobId}
            onPick={() => void pick(jobId)}
            pickLabel={`Pick face ${i + 1}`}
            footer={() => checking === jobId && <span className="text-control text-ink-muted">Checking the face</span>}
          />
        ))}
      </div>
      {error && (
        <p className="text-control text-drift" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button onClick={onNext} disabled={!draft.pickedCandidateJobId || (!animated && !draft.candidateDescriptor)}>
          Draw the sheet from this face
        </Button>
        <Button variant="secondary" onClick={onBack}>
          Change the description
        </Button>
      </div>
    </div>
  );
}
