import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useEstimateLabel, useJob } from "@/lib/jobs/hooks";
import { VOICES, voice } from "@/lib/presets/load";
import { MODEL_IDS } from "@/lib/registry/models";
import { useBlobUrl } from "@/lib/store/hooks";
import {
  MAX_LINE_CHARS,
  MAX_LINE_SEC,
  speakingDefaults,
  speakingInput,
  speakLine,
  startLipSync,
  startSpeakingClip,
  storeRecording,
  type SpokenLine,
} from "@/lib/studio/voice";
import type { Job } from "@/lib/types/jobs";
import { cn } from "@/lib/utils";
import { jobStatusText } from "./JobTake";
import { Field, TextArea } from "./fields";
import { VoicePicker } from "./VoicePicker";

function SpeakStatus({ jobId, label }: { jobId: string; label: string }) {
  const job = useJob(jobId);
  if (!job) return null;
  const done = job.status === "done" && job.generationIds[0];
  return (
    <p className="text-control" role="status">
      {label}: {done ? "done. " : jobStatusText(job)}
      {done && (
        <Link to={`/library/${job.generationIds[0]}`} className="font-semibold underline underline-offset-4">
          See the clip
        </Link>
      )}
    </p>
  );
}

// "Speak" on a clip (spec: Finishing, Voice and Lip sync): write a line, pick
// a stock voice or bring a recording, hear it, then lip sync this clip to it
// or make a new speaking clip of the same cast. Director keeps its shot, so
// it offers lip sync only, inside its own fold-out (no heading).
export function SpeakAction({
  generationId,
  className,
  onStarted,
  allowNewClip = true,
  heading = true,
}: {
  generationId: string;
  className?: string;
  onStarted?: (job: Job) => void;
  allowNewClip?: boolean;
  heading?: boolean;
}) {
  const ids = { line: useId(), voice: useId(), rights: useId() };
  const file = useRef<HTMLInputElement>(null);
  const [defaults, setDefaults] = useState<Awaited<ReturnType<typeof speakingDefaults>> | null>();
  const [text, setText] = useState("");
  const [voiceId, setVoiceId] = useState<string | undefined>(VOICES[0]?.id);
  const [rights, setRights] = useState(false);
  const [line, setLine] = useState<SpokenLine>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [started, setStarted] = useState<{ id: string; label: string }[]>([]);
  const lineUrl = useBlobUrl(line?.blobId);

  useEffect(() => {
    let live = true;
    void speakingDefaults(generationId).then((d) => {
      if (!live) return;
      setDefaults(allowNewClip ? (d ?? null) : null);
      if (d?.voiceId && voice(d.voiceId)) setVoiceId(d.voiceId);
    });
    return () => {
      live = false;
    };
  }, [generationId]);

  const voicePrice = useEstimateLabel(MODEL_IDS.elevenLabs, text.trim() && voiceId ? async () => ({ lines: [{ text, voiceId }] }) : undefined, `${text}:${voiceId}`);
  // Sync-3's links only exist once both files are uploaded, so the estimate uses stand-ins.
  const syncPrice = useEstimateLabel(MODEL_IDS.sync3, line ? async () => ({ videoUrl: "https://example.invalid/clip.mp4", audioUrl: "https://example.invalid/line.mp3" }) : undefined, line?.blobId ?? "");
  const speakingPrice = useEstimateLabel(
    MODEL_IDS.minimaxH3,
    line && defaults ? async () => (await speakingInput({ ...defaults.request, line }, "https://example.invalid/line.mp3")).input : undefined,
    `${line?.blobId}:${defaults?.request.scene}`,
  );

  async function step(label: string, work: () => Promise<void>) {
    setBusy(label);
    setError(undefined);
    try {
      await work();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <section aria-label="Speak a line" className={cn("grid gap-3", heading && "border-t border-rule pt-4", className)}>
      {heading && <h2 className="text-body font-semibold">Speak a line</h2>}
      <Field label="Line" hint={`Up to ${MAX_LINE_SEC} s once spoken, about 40 words.`}>
        {(id) => <TextArea id={id} value={text} rows={3} maxLength={MAX_LINE_CHARS} placeholder="I wrote this forty years ago." onChange={setText} />}
      </Field>
      <Field label="Voice" hint="Stock voices only: no voice cloning.">
        {(id) => <VoicePicker id={id} value={voiceId} onChange={setVoiceId} />}
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" disabled={!text.trim() || !voiceId || busy !== undefined} onClick={() => void step("voice", async () => setLine(await speakLine(text, voiceId!)))}>
          {busy === "voice" ? "Speaking" : `Make the line · ${voicePrice}`}
        </Button>
        <Button size="sm" variant="ghost" disabled={!rights || busy !== undefined} onClick={() => file.current?.click()}>
          Use a recording
        </Button>
        <input
          ref={file}
          type="file"
          accept="audio/mpeg,audio/wav"
          className="hidden"
          tabIndex={-1}
          aria-label="Recording to use"
          onChange={(e) => {
            const picked = e.target.files?.[0];
            e.target.value = "";
            if (picked) void step("recording", async () => setLine(await storeRecording(picked)));
          }}
        />
      </div>
      <label htmlFor={ids.rights} className="flex items-start gap-2 text-control">
        <Checkbox id={ids.rights} checked={rights} onCheckedChange={(v) => setRights(v === true)} className="mt-0.5" />
        To use a recording: I recorded it or have the rights to use it.
      </label>

      {line && (
        <div className="grid gap-2">
          {lineUrl && <audio src={lineUrl} controls className="w-full" aria-label={line.text ? `The line: ${line.text}` : "Your recording"} />}
          <p className="text-control text-ink-muted">
            {line.durationSec.toFixed(1)} s{line.voiceId ? `, ${voice(line.voiceId)?.label ?? "stock voice"}` : ", your recording"}
          </p>
          <div className="flex flex-wrap gap-2">
            {defaults && (
              <Button
                size="sm"
                disabled={busy !== undefined}
                onClick={() =>
                  void step("speaking", async () => {
                    const job = await startSpeakingClip({ ...defaults.request, line });
                    setStarted((s) => [{ id: job.id, label: "New speaking clip" }, ...s]);
                    onStarted?.(job);
                  })
                }
              >
                New speaking clip · {speakingPrice}
              </Button>
            )}
            <Button
              size="sm"
              variant={defaults ? "secondary" : "primary"}
              disabled={busy !== undefined}
              onClick={() =>
                void step("sync", async () => {
                  const job = await startLipSync(generationId, line);
                  if (onStarted) onStarted(job);
                  else setStarted((s) => [{ id: job.id, label: "Lip sync" }, ...s]);
                })
              }
            >
              Lip sync this clip · {syncPrice}
            </Button>
          </div>
          <p className="text-control text-ink-muted">
            {defaults
              ? `A new speaking clip draws ${defaults.speakerName} again from their sheet on MiniMax H3, mouth following the words. Lip sync keeps this exact clip and moves only the mouth.`
              : "Lip sync keeps this exact clip and moves only the mouth to the line."}
          </p>
        </div>
      )}
      {started.map((s) => (
        <SpeakStatus key={s.id} jobId={s.id} label={s.label} />
      ))}
      {error && (
        <p className="text-control text-drift" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
