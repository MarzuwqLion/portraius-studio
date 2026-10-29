import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Screen } from "@/components/shell/Screen";
import { JobTake } from "@/components/studio/JobTake";
import { VoicePicker } from "@/components/studio/VoicePicker";
import { ScoreBadge, Take } from "@/components/studio/Take";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { jobImage, scoreImage } from "@/lib/characters/create";
import { CONSENT_CLIP } from "@/lib/characters/format";
import { applyRedraw, exportFile, setVoice, startRedraw } from "@/lib/characters/manage";
import { isFromReference } from "@/lib/characters/reference";
import { SHEET_PATHS, SHEET_VIEWS, viewAspect, viewLabel, type SheetView } from "@/lib/characters/sheet";
import { useJobs } from "@/lib/jobs/hooks";
import { saveFile } from "@/lib/library/library";
import { canShareFile, shareFile } from "@/lib/media/share";
import { voice } from "@/lib/presets/load";
import { deleteCharacter, isUsable, loadBundle } from "@/lib/store/characters";
import { useBlobUrl, useCharacter } from "@/lib/store/hooks";
import { nextSlot } from "@/lib/studio/cast";
import { makeLikenessSheet } from "@/lib/studio/likeness-sheet";
import type { Launch } from "@/lib/studio/launch";
import type { CharacterRecord } from "@/lib/types/records";
import { CharacterBadges } from "./CharactersScreen";

const CURRENT = "current";

function ViewPanel({ record, view }: { record: CharacterRecord; view: SheetView }) {
  const url = useBlobUrl(record.blobIds[SHEET_PATHS[view]]);
  const [redraws, setRedraws] = useState<string[]>([]);
  const [picked, setPicked] = useState(CURRENT);
  const [scores, setScores] = useState<Record<string, number | null>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const jobs = useJobs(redraws);
  const references = record.file.identity?.descriptors ?? [];
  const scored = references.length > 0;
  const elementType = record.kind === "element" ? (record.file.elementType === "outfit" || record.file.elementType === "location" ? record.file.elementType : "prop") : undefined;

  // Score the current view, and each redraw once it lands.
  useEffect(() => {
    if (!scored) return;
    let live = true;
    void (async () => {
      const bundle = await loadBundle(record.id);
      const current = bundle?.files.get(SHEET_PATHS[view]);
      if (current && scores[`${CURRENT}:${record.updatedAt}`] === undefined) {
        const score = await scoreImage(current, references).catch(() => null);
        if (live) setScores((s) => ({ ...s, [`${CURRENT}:${record.updatedAt}`]: score }));
      }
      for (const job of jobs ?? []) {
        if (job?.status !== "done" || scores[job.id] !== undefined) continue;
        const image = await jobImage(job.id);
        const score = image ? await scoreImage(image, references).catch(() => null) : null;
        if (live) setScores((s) => ({ ...s, [job.id]: score }));
      }
    })();
    return () => {
      live = false;
    };
  }, [record.updatedAt, jobs]); // scores are read, not tracked

  async function redraw() {
    setBusy(true);
    setError(undefined);
    try {
      const id = await startRedraw(record, view);
      setRedraws((r) => [...r, id]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function keepTake() {
    setBusy(true);
    try {
      await applyRedraw(record, view, picked);
      setRedraws([]);
      setPicked(CURRENT);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const scoreLine = (key: string) =>
    scored ? (
      <span className="grid gap-1">
        <ScoreBadge score={scores[key]} />
        {view === "profile" && <span className="text-control text-ink-muted">Profiles score low by design.</span>}
      </span>
    ) : elementType ? null : (
      <span className="text-control text-ink-muted">{record.file.appearance === "animated" ? "Animated characters aren't scored" : "No face data to score against"}</span>
    );
  const working = jobs?.some((j) => j && !["done", "failed", "cancelled", "expired"].includes(j.status));
  const choosing = redraws.length > 0;

  return (
    <div className="grid content-start gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-body font-semibold">{viewLabel(view, elementType)}</h3>
        {isUsable(record) && (
          <Button variant="ghost" size="sm" onClick={() => void redraw()} disabled={busy || working}>
            Redraw
          </Button>
        )}
      </div>
      <div className={choosing ? "grid grid-cols-2 gap-3" : "grid"}>
        <div className="grid gap-2">
          <Take
            src={url}
            alt={`${viewLabel(view, elementType)} view of ${record.name}`}
            aspect={viewAspect(view, elementType)}
            picked={choosing && picked === CURRENT}
            rejected={choosing && picked !== CURRENT}
            onPick={choosing ? () => setPicked(CURRENT) : undefined}
            pickLabel="Keep the current view"
            seed={21}
          />
          {scoreLine(`${CURRENT}:${record.updatedAt}`)}
        </div>
        {redraws.map((id, i) => (
          <JobTake
            key={id}
            jobId={id}
            alt={`${viewLabel(view, elementType)} view, new take ${i + 1}`}
            aspect={viewAspect(view, elementType)}
            seed={22 + i}
            picked={picked === id}
            rejected={picked !== id && jobs?.find((j) => j?.id === id)?.status === "done"}
            onPick={() => setPicked(id)}
            pickLabel={`Use new take ${i + 1}`}
            footer={(job) => (job?.status === "done" ? scoreLine(id) : null)}
          />
        ))}
      </div>
      {choosing && picked !== CURRENT && (
        <Button size="sm" onClick={() => void keepTake()} disabled={busy} className="justify-self-start">
          Use this take
        </Button>
      )}
      {error && (
        <p className="text-control text-drift" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function ExportPanel({ record }: { record: CharacterRecord }) {
  const hasClip = Boolean(record.file.consent?.checkClip && record.blobIds[CONSENT_CLIP]);
  const [includeClip, setIncludeClip] = useState(false);
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const { blob, filename } = await exportFile(record, { includeClip });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-3">
      <h2 className="text-panel font-semibold">Export</h2>
      <p className="max-w-[70ch] text-body text-ink-muted">
        {record.kind === "element"
          ? "A .portraius file holds the photos and the sheet. Keep it as a backup, or send it to someone you're making things with."
          : "A .portraius file holds the photos, sheet, face data and consent record. Keep it as a backup, or send it to someone you're making things with."}
      </p>
      {hasClip && (
        <label className="flex items-start gap-3 text-body">
          <Checkbox checked={includeClip} onCheckedChange={(v) => setIncludeClip(v === true)} className="mt-0.5" />
          <span>Include the consent check clip</span>
        </label>
      )}
      <Button variant="secondary" onClick={() => void download()} disabled={busy} className="justify-self-start">
        Export file
      </Button>
    </section>
  );
}

// A default stock voice (spec: Voice), saved in the character file so it
// travels with it. Speak panels start from it.
function VoicePanel({ record }: { record: CharacterRecord }) {
  const [error, setError] = useState<string>();
  return (
    <section className="grid max-w-xl gap-3">
      <h2 className="text-panel font-semibold">Voice</h2>
      <p className="max-w-[70ch] text-body text-ink-muted">A stock voice for {record.name}&apos;s lines. Stock voices only: there&apos;s no voice cloning.</p>
      <VoicePicker
        value={record.file.voice?.voiceId}
        placeholder="No voice yet"
        label={`Voice for ${record.name}`}
        onChange={(id) => {
          const picked = voice(id);
          setError(undefined);
          void setVoice(record, picked ? { provider: "elevenlabs", voiceId: picked.id, label: picked.label } : undefined).catch((err: Error) => setError(err.message));
        }}
      />
      {error && (
        <p className="text-control text-drift" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

// The likeness sheet (contest polish, October 25): this person's best-scored
// shots in one picture, each with its score, to download or share.
function LikenessSheetPanel({ record }: { record: CharacterRecord }) {
  const [sheet, setSheet] = useState<{ url: string; file: File }>();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>();
  useEffect(() => () => sheet && URL.revokeObjectURL(sheet.url), [sheet]);

  async function make() {
    setBusy(true);
    setNote(undefined);
    try {
      const made = await makeLikenessSheet(record);
      if (!made) {
        setNote(`No stills of ${record.name} with a likeness of 60 or more yet. Make a few images with them first.`);
        return;
      }
      setSheet({ url: URL.createObjectURL(made.blob), file: new File([made.blob], made.name, { type: "image/png" }) });
    } catch (err) {
      setNote((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-3">
      <h2 className="text-panel font-semibold">Likeness sheet</h2>
      <p className="max-w-[70ch] text-body text-ink-muted">
        {record.name}&apos;s best-scored shots from your library in one picture, each with its likeness score, ready to post.
      </p>
      <Button variant="secondary" onClick={() => void make()} disabled={busy} className="justify-self-start">
        {busy ? "Drawing the sheet" : sheet ? "Draw it again" : "Make a likeness sheet"}
      </Button>
      {note && <p className="text-control">{note}</p>}
      {sheet && (
        <div className="grid max-w-md gap-3">
          <img src={sheet.url} alt={`Likeness sheet for ${record.name}`} className="w-full rounded-media border border-rule" />
          <div className="flex flex-wrap gap-3">
            {canShareFile(sheet.file) && (
              <Button size="sm" onClick={() => void shareFile(sheet.file).catch((err: Error) => setNote(err.message))}>
                Share
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => saveFile(sheet.file, sheet.file.name)}>
              Download
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function DeletePanel({ record }: { record: CharacterRecord }) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  return (
    <section className="grid gap-3">
      {confirming ? (
        <>
          <p className="max-w-[70ch] text-body">Delete {record.name} and all their files from this browser? Export it first if you want to keep it.</p>
          <div className="flex gap-3">
            <Button variant="danger" onClick={() => void deleteCharacter(record.id).then(() => navigate("/characters", { replace: true }))}>
              Delete character
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </div>
        </>
      ) : (
        <Button variant="ghost" onClick={() => setConfirming(true)} className="justify-self-start">
          Delete character
        </Button>
      )}
    </section>
  );
}

// The next step from a character's page (Decisions, October 21, U5, item 6):
// a studio with them cast, through the same Launch state as the Tour's
// handoff, with no preset. Recast takes a person as its performer, so an
// element goes to Image and Video only.
function UseIn({ record }: { record: CharacterRecord }) {
  const navigate = useNavigate();
  const state: Launch = { cast: [{ slot: nextSlot(record, []), characterId: record.id }] };
  const targets = [
    { to: "/image", label: "Use in an image" },
    { to: "/video", label: "Use in a video" },
    ...(record.kind === "person" ? [{ to: "/recast", label: "Use in a recast" }] : []),
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {targets.map((t, i) => (
        <Button key={t.to} variant={i === 0 ? "primary" : "secondary"} onClick={() => navigate(t.to, { state })}>
          {t.label}
        </Button>
      ))}
    </div>
  );
}

export function CharacterDetailScreen() {
  const { id } = useParams();
  const record = useCharacter(id);
  const composite = useBlobUrl(record ? record.blobIds[record.file.sheet.composite] : undefined);
  const fromReference = record ? isFromReference(record.file) : false;

  if (record === undefined) return <Screen title="Character" />;
  if (record === null) {
    return (
      <Screen title="Character">
        <p className="text-body">
          This character isn't in your vault.{" "}
          <Link to="/characters" className="font-semibold text-accent-text underline underline-offset-4">
            Back to cast and elements
          </Link>
        </p>
      </Screen>
    );
  }

  return (
    <Screen title={record.name} actions={<CharacterBadges record={record} />}>
      <div className="grid gap-10">
        {isUsable(record) && <UseIn record={record} />}
        {record.locked && (
          <p className="max-w-[70ch] text-body text-drift">
            Imported without a consent record. You can view this character, but it can't be used in any generation. The person in the photos can
            make their own character and send you the file.
          </p>
        )}
        {(record.file.description || record.file.tags.length > 0) && (
          <div className="grid max-w-[70ch] gap-2">
            {record.file.description && <p className="text-body">{record.file.description}</p>}
            {record.file.tags.length > 0 && <p className="text-control text-ink-muted">{record.file.tags.join(", ")}</p>}
          </div>
        )}
        <Take src={composite} alt={`${fromReference ? "Reference" : "Turnaround sheet"} for ${record.name}`} aspect="16 / 9" className="max-w-5xl" />
        {/* A reference character's one image is its sheet and every view: there's nothing to redraw. */}
        {fromReference ? (
          <p className="max-w-[70ch] text-control text-ink-muted">Your own reference, used as it is in every image and video.</p>
        ) : (
          <section className="grid gap-4">
            <h2 className="text-panel font-semibold">Views</h2>
            <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
              {SHEET_VIEWS.map((view) => (
                <ViewPanel key={view} record={record} view={view} />
              ))}
            </div>
          </section>
        )}
        {record.file.consent && (
          <p className="max-w-[70ch] text-control text-ink-muted">
            Consent: {record.file.consent.subjectName} passed the webcam check on {new Date(record.file.consent.acceptedAt).toLocaleDateString()} (face match{" "}
            {record.file.consent.matchScore}). The record is an attestation, not proof.
          </p>
        )}
        {record.kind === "person" && <VoicePanel record={record} />}
        {record.kind === "person" && !record.locked && record.file.appearance !== "animated" && <LikenessSheetPanel record={record} />}
        <ExportPanel record={record} />
        <DeletePanel record={record} />
      </div>
    </Screen>
  );
}
