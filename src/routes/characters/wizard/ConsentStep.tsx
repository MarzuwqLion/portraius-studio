import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CHALLENGE_TEXT, CONSENT_STATEMENT, MAX_ATTEMPTS, consentRecord, pickChallenges, type Challenge } from "@/lib/characters/consent";
import { referenceDescriptors } from "@/lib/characters/create";
import { deleteDraftBlob, putDraftBlob, type WizardDraft } from "@/lib/characters/draft";
import { runWebcamCheck, type CheckOutcome, type CheckPhase } from "@/lib/characters/webcam-check";
import { cn } from "@/lib/utils";
import type { UpdateDraft } from "./useDraft";

type Stage = "intro" | "starting" | "running" | "passed" | "failed" | "camera-error";

function stopStream(stream: MediaStream | undefined) {
  stream?.getTracks().forEach((t) => t.stop());
}

export function ConsentStep({ draft, update, onNext }: { draft: WizardDraft; update: UpdateDraft; onNext: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | undefined>(undefined);
  const abort = useRef<AbortController | undefined>(undefined);
  const [stage, setStage] = useState<Stage>("intro");
  const [phase, setPhase] = useState<CheckPhase>();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [outcome, setOutcome] = useState<CheckOutcome>();
  const [cameraError, setCameraError] = useState<string>();
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [keepClip, setKeepClip] = useState(false);
  const nameId = useId();
  const blocked = draft.consentFailures >= MAX_ATTEMPTS;

  useEffect(
    () => () => {
      abort.current?.abort();
      stopStream(stream.current);
    },
    [],
  );

  async function start() {
    setStage("starting");
    setOutcome(undefined);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    } catch (err) {
      setCameraError((err as Error).name === "NotAllowedError" ? "The camera was blocked. Allow camera access for this site, then try again." : "No camera was found.");
      setStage("camera-error");
      return;
    }
    const el = video.current!;
    el.srcObject = stream.current;
    await el.play();
    const picked = pickChallenges();
    setChallenges(picked);
    abort.current = new AbortController();
    try {
      setStage("running");
      const result = await runWebcamCheck({
        video: el,
        stream: stream.current,
        challenges: picked,
        references: await referenceDescriptors(draft),
        onPhase: setPhase,
        signal: abort.current.signal,
      });
      setOutcome(result);
      if (result.passed) setStage("passed");
      else {
        update((d) => ({ consentFailures: d.consentFailures + 1 }));
        setStage("failed");
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setCameraError("The face checker couldn't run. Reload the page and try again.");
        setStage("camera-error");
      }
    } finally {
      stopStream(stream.current);
      el.srcObject = null;
    }
  }

  async function agree() {
    if (outcome?.match.score === undefined) return;
    const clipId = keepClip && outcome.clip ? await putDraftBlob(draft.path, "consent-clip", outcome.clip) : undefined;
    if (draft.consentClipBlobId && !clipId) void deleteDraftBlob(draft.consentClipBlobId);
    update({
      consent: consentRecord({ subjectName: name, challenge: challenges, matchScore: outcome.match.score, keepClip: Boolean(clipId) }),
      consentClipBlobId: clipId,
    });
    onNext();
  }

  if (draft.consent && stage === "intro") {
    return (
      <div className="grid max-w-[70ch] gap-4">
        <h2 className="text-panel font-semibold">Consent recorded</h2>
        <p className="text-body">
          {draft.consent.subjectName} passed the check on {new Date(draft.consent.acceptedAt).toLocaleString()}, with a face match of{" "}
          {draft.consent.matchScore}.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button onClick={onNext}>Continue to the sheet</Button>
          <Button variant="secondary" onClick={() => update({ consent: undefined })}>
            Redo the check
          </Button>
        </div>
      </div>
    );
  }

  if (blocked && stage !== "passed") {
    return (
      <div className="grid max-w-[70ch] gap-4">
        <h2 className="text-panel font-semibold">This character can't be made from these photos</h2>
        <p className="text-body">
          The check didn't pass {MAX_ATTEMPTS} times. A character from photos has to be made by the person in them. You can still design an
          original character from a description.
        </p>
        <Link to="/characters/new?from=text" className={buttonVariants({ variant: "primary", className: "justify-self-start" })}>
          Design a character
        </Link>
      </div>
    );
  }

  const prompt =
    phase?.kind === "challenge" ? CHALLENGE_TEXT[phase.challenge] : phase?.kind === "baseline" ? "Look at the camera" : stage === "starting" ? "Getting the camera ready" : "";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
      <div className="relative overflow-hidden rounded-media border border-rule bg-seamless" style={{ aspectRatio: "4 / 3" }}>
        <video ref={video} muted playsInline className={cn("absolute inset-0 size-full -scale-x-100 object-cover", stage === "running" || stage === "starting" ? "opacity-100" : "opacity-0")} />
        {(stage === "running" || stage === "starting") && (
          <p className="absolute inset-x-0 bottom-0 bg-seamless/80 p-4 text-center font-display text-screen font-extrabold text-on-seamless" aria-live="assertive">
            {prompt}
          </p>
        )}
        {stage !== "running" && stage !== "starting" && (
          <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-body text-on-seamless">Your camera shows here during the check.</p>
        )}
      </div>

      <div className="grid content-start gap-4">
        <h2 className="text-panel font-semibold">Consent check</h2>
        {stage === "intro" && (
          <>
            <p className="max-w-[70ch] text-body">
              Three quick prompts on camera, about 15 seconds. It proves you're the person in the photos. The check runs in this browser; the clip is
              kept only if you choose to keep it.
            </p>
            <Button onClick={() => void start()} className="justify-self-start">
              Start the check
            </Button>
          </>
        )}
        {stage === "running" && <p className="text-body text-ink-muted">Follow the prompts under the picture.</p>}
        {stage === "camera-error" && (
          <>
            <p className="text-body text-drift" role="alert">
              {cameraError}
            </p>
            <Button onClick={() => void start()} className="justify-self-start">
              Try again
            </Button>
          </>
        )}
        {(stage === "passed" || stage === "failed") && outcome && (
          <ul className="grid gap-2">
            {outcome.results.map((r) => (
              <li key={r.challenge} className="text-body">
                <span className={cn("font-semibold", r.passed ? "text-match" : "text-drift")}>{r.passed ? "Passed" : "Not passed"}</span> ·{" "}
                {CHALLENGE_TEXT[r.challenge]}
                {r.reason && <span className="block text-control text-ink-muted">{r.reason}</span>}
              </li>
            ))}
            <li className="text-body">
              <span className={cn("font-semibold", outcome.match.passed ? "text-match" : "text-drift")}>
                {outcome.match.passed ? "Passed" : "Not passed"}
              </span>{" "}
              · Face matches the photos{outcome.match.score !== undefined ? ` (${outcome.match.score})` : ""}
              {outcome.match.reason && <span className="block text-control text-ink-muted">{outcome.match.reason}</span>}
            </li>
          </ul>
        )}
        {stage === "failed" && (
          <div className="grid gap-3">
            <p className="text-body">
              {draft.consentFailures >= MAX_ATTEMPTS
                ? "That was the last try."
                : `${MAX_ATTEMPTS - draft.consentFailures} ${MAX_ATTEMPTS - draft.consentFailures === 1 ? "try" : "tries"} left.`}
            </p>
            {draft.consentFailures < MAX_ATTEMPTS && (
              <Button onClick={() => void start()} className="justify-self-start">
                Try the check again
              </Button>
            )}
          </div>
        )}
        {stage === "passed" && (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void agree();
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor={nameId}>Your full name</Label>
              <Input id={nameId} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            </div>
            <label className="flex max-w-[70ch] items-start gap-3 text-body">
              <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5" />
              <span>{CONSENT_STATEMENT}</span>
            </label>
            {outcome?.clip && (
              <label className="flex items-start gap-3 text-body">
                <Checkbox checked={keepClip} onCheckedChange={(v) => setKeepClip(v === true)} className="mt-0.5" />
                <span>Keep the check clip with this character</span>
              </label>
            )}
            <Button type="submit" disabled={!agreed || !name.trim()} className="justify-self-start">
              Agree and continue
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
