import { useEffect, useRef, useState } from "react";
import { JobTake } from "@/components/studio/JobTake";
import { ScoreBadge } from "@/components/studio/Take";
import { Button } from "@/components/ui/button";
import { compositeInputFor, isAnimatedDraft, jobImage, pickedViews, referenceDescriptors, scoreImage, startComposite, startView } from "@/lib/characters/create";
import type { WizardDraft } from "@/lib/characters/draft";
import { FLAGGED_VIEWS, SHEET_VIEWS, viewAspect, viewLabel, type SheetView } from "@/lib/characters/sheet";
import { MATCH_SCORE } from "@/lib/identity/score";
import { useEstimateLabel, useJob, useJobs } from "@/lib/jobs/hooks";
import { withPrice } from "@/lib/jobs/estimate";
import { ModelPicker } from "@/components/studio/ModelPicker";
import { useFeatureModels } from "@/lib/session/engine";
import type { Job } from "@/lib/types/jobs";
import type { UpdateDraft } from "./useDraft";

const failed = (job: Job | undefined) => job?.status === "failed" || job?.status === "expired" || job?.status === "cancelled";

export function SheetStep({ draft, update, onNext }: { draft: WizardDraft; update: UpdateDraft; onNext: () => void }) {
  const compositeId = draft.compositeJobIds.at(-1);
  const composite = useJob(compositeId);
  const viewIds = SHEET_VIEWS.flatMap((v) => draft.viewJobIds[v]);
  const viewJobs = useJobs(viewIds);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const startedViewsFor = useRef<string | undefined>(undefined);
  const scoring = useRef(new Set<string>());
  // An element has no face, so nothing is scored; nor is an animated face,
  // which face-api can't match.
  const elementType = draft.path === "element" ? (draft.elementType ?? "prop") : undefined;
  const scored = !elementType && !isAnimatedDraft(draft);
  const { modelId, option } = useFeatureModels("characters");
  const price = useEstimateLabel(modelId, compositeId ? undefined : () => compositeInputFor(draft, modelId), draft.id);

  const jobById = new Map<string, Job>();
  viewJobs?.forEach((job) => job && jobById.set(job.id, job));

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await work();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const drawSheet = () => run(async () => {
    const id = await startComposite(draft, modelId);
    update((d) => ({ compositeJobIds: [...d.compositeJobIds, id] }));
  });

  const redraw = (view: SheetView) => run(async () => {
    const id = await startView(draft, view);
    update((d) => ({ viewJobIds: { ...d.viewJobIds, [view]: [...d.viewJobIds[view], id] } }));
  });

  // The four views start as soon as the first composite lands.
  useEffect(() => {
    if (composite?.status !== "done" || !compositeId || viewIds.length || startedViewsFor.current === compositeId) return;
    startedViewsFor.current = compositeId;
    void run(async () => {
      for (const view of SHEET_VIEWS) {
        const id = await startView(draft, view);
        update((d) => ({ viewJobIds: { ...d.viewJobIds, [view]: [...d.viewJobIds[view], id] } }));
      }
    });
    // The ref keeps this to one run per composite, even when effects run twice.
  }, [composite?.status, compositeId, viewIds.length]);

  // Score finished takes (the composite too), and pick each view's first
  // finished take by default.
  useEffect(() => {
    void (async () => {
      const references = await referenceDescriptors(draft);
      const scoreJob = async (id: string) => {
        scoring.current.add(id);
        const image = await jobImage(id);
        const score = image ? await scoreImage(image, references).catch(() => null) : null;
        update((d) => ({ scores: { ...d.scores, [id]: score } }));
      };
      if (scored && compositeId && composite?.status === "done" && !(compositeId in draft.scores) && !scoring.current.has(compositeId)) await scoreJob(compositeId);
      for (const view of SHEET_VIEWS) {
        for (const id of draft.viewJobIds[view]) {
          const job = jobById.get(id);
          if (job?.status !== "done") continue;
          if (!draft.pickedViewJobIds[view]) update((d) => (d.pickedViewJobIds[view] ? {} : { pickedViewJobIds: { ...d.pickedViewJobIds, [view]: id } }));
          if (!scored || id in draft.scores || scoring.current.has(id)) continue;
          await scoreJob(id);
        }
      }
    })();
  }, [viewJobs, composite?.status]);

  const picks = pickedViews(draft);
  const ready = Boolean(picks && SHEET_VIEWS.every((v) => jobById.get(picks[v])?.status === "done"));

  return (
    <div className="grid gap-8">
      <section className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-panel font-semibold">{elementType ? "Reference sheet" : "Turnaround sheet"}</h2>
            <p className="max-w-[70ch] text-body text-ink-muted">One composite from {draft.path === "text" ? "the face you picked" : "your photos"}, then four single views drawn from both.</p>
          </div>
          {!compositeId ? (
            <Button onClick={() => void drawSheet()} disabled={busy || Boolean(option?.blocked)}>
              {withPrice("Draw the sheet", price)}
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => void drawSheet()} disabled={busy || Boolean(option?.blocked) || (composite?.status !== "done" && !failed(composite))}>
              Redraw the sheet
            </Button>
          )}
        </div>
        <div className="max-w-xs">
          <ModelPicker feature="characters" label="Draw with" hint="The single views use the model that drew the sheet." />
        </div>
        <div className="max-w-5xl">
          {compositeId ? (
            <JobTake
              jobId={compositeId}
              alt={`${elementType ? "Reference" : "Turnaround"} sheet for ${draft.name || (elementType ? "this element" : "this character")}`}
              aspect="16 / 9"
              footer={(job) => (scored && job?.status === "done" ? <ScoreBadge score={draft.scores[compositeId]} /> : null)}
            />
          ) : (
            <div className="rounded-media border border-rule bg-seamless" style={{ aspectRatio: "16 / 9" }} />
          )}
        </div>
      </section>

      {viewIds.length > 0 && (
        <section className="grid gap-4">
          <h2 className="text-panel font-semibold">Single views</h2>
          <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
            {SHEET_VIEWS.map((view) => {
              const takes = draft.viewJobIds[view];
              const picked = draft.pickedViewJobIds[view];
              const pickedScore = picked ? draft.scores[picked] : undefined;
              const working = takes.some((id) => {
                const s = jobById.get(id)?.status;
                return s !== undefined && s !== "done" && !failed(jobById.get(id));
              });
              return (
                <div key={view} className="grid content-start gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-body font-semibold">{viewLabel(view, elementType)}</h3>
                    <Button variant="ghost" size="sm" onClick={() => void redraw(view)} disabled={busy || working || composite?.status !== "done"}>
                      Redraw
                    </Button>
                  </div>
                  <div className={takes.length > 1 ? "grid grid-cols-2 gap-3" : "grid"}>
                    {takes.map((id, i) => (
                      <JobTake
                        key={id}
                        jobId={id}
                        alt={`${viewLabel(view, elementType)} view, take ${i + 1}`}
                        aspect={viewAspect(view, elementType)}
                        seed={i + 11}
                        picked={takes.length > 1 && picked === id}
                        rejected={takes.length > 1 && picked !== id && jobById.get(id)?.status === "done"}
                        onPick={() => update((d) => ({ pickedViewJobIds: { ...d.pickedViewJobIds, [view]: id } }))}
                        pickLabel={`Use take ${i + 1} for the ${viewLabel(view, elementType).toLowerCase()} view`}
                        footer={(job) =>
                          scored && job?.status === "done" ? (
                            <span className="grid gap-1">
                              <ScoreBadge score={draft.scores[id]} />
                              {view === "profile" && <span className="text-control text-ink-muted">Profiles score low by design.</span>}
                            </span>
                          ) : null
                        }
                      />
                    ))}
                  </div>
                  {scored && FLAGGED_VIEWS.includes(view) && pickedScore !== undefined && pickedScore !== null && pickedScore < MATCH_SCORE && (
                    <p className="text-control text-ink-muted">This take drifts from the reference. Redraw it, or keep it if it looks right to you.</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {error && (
        <p className="text-control text-drift" role="alert">
          {error}
        </p>
      )}
      <Button onClick={onNext} disabled={!ready} className="justify-self-start">
        Continue
      </Button>
    </div>
  );
}
