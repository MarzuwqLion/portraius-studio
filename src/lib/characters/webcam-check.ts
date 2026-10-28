// Runs the consent check on a live webcam (spec: Character vault, Consent
// check): a short baseline, then three prompts, sampling frames with face-api
// and recording the clip. The pass or fail decisions are in consent.ts.
import { loadFaceApi, sampleVideoFrame } from "@/lib/identity/embed";
import { eyeOpenness, pitch, yaw } from "@/lib/identity/pose";
import { bestDistance } from "@/lib/identity/score";
import {
  BASELINE_MS,
  CHALLENGE_MS,
  checkPassed,
  verifyChallenge,
  verifyMatch,
  type Challenge,
  type ChallengeResult,
  type FrameSample,
  type MatchResult,
} from "./consent";

export type CheckPhase = { kind: "baseline" } | { kind: "challenge"; index: number; challenge: Challenge };

export interface CheckOutcome {
  passed: boolean;
  results: ChallengeResult[];
  match: MatchResult;
  clip?: Blob;
}

// Every few frames also computes a descriptor for the face match.
const DESCRIPTOR_EVERY = 4;

function startRecording(stream: MediaStream): { stop: () => Promise<Blob | undefined> } {
  const type = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t));
  if (!type) return { stop: async () => undefined };
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 600_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.start(500);
  return {
    stop: () =>
      new Promise((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
        recorder.stop();
      }),
  };
}

export async function runWebcamCheck(options: {
  video: HTMLVideoElement;
  stream: MediaStream;
  challenges: Challenge[];
  references: readonly number[][];
  onPhase: (phase: CheckPhase) => void;
  signal: AbortSignal;
}): Promise<CheckOutcome> {
  const { video, stream, challenges, references, onPhase, signal } = options;
  await loadFaceApi();
  const recording = startRecording(stream);
  const samples: FrameSample[] = [];
  const total = BASELINE_MS + challenges.length * CHALLENGE_MS;
  const started = performance.now();
  let phaseKey = "";
  let frame = 0;
  let clip: Blob | undefined;

  try {
    for (;;) {
      if (signal.aborted) throw new DOMException("The check was stopped.", "AbortError");
      const atMs = performance.now() - started;
      if (atMs >= total) break;
      const index = Math.floor((atMs - BASELINE_MS) / CHALLENGE_MS);
      const phase: CheckPhase = atMs < BASELINE_MS ? { kind: "baseline" } : { kind: "challenge", index, challenge: challenges[index]! };
      const key = phase.kind === "baseline" ? "baseline" : `c${index}`;
      if (key !== phaseKey) {
        phaseKey = key;
        onPhase(phase);
      }
      const observed = await sampleVideoFrame(video, frame++ % DESCRIPTOR_EVERY === 0);
      const sample: FrameSample = { atMs, faceCount: observed.faceCount };
      if (observed.landmarks) {
        sample.yaw = yaw(observed.landmarks);
        sample.pitch = pitch(observed.landmarks);
        sample.eyeOpenness = eyeOpenness(observed.landmarks);
      }
      if (observed.happy !== undefined) sample.happy = observed.happy;
      if (observed.descriptor && references.length) sample.distance = bestDistance(observed.descriptor, references);
      samples.push(sample);
      // Let the page paint between frames.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    clip = await recording.stop();
  }

  const baseline = samples.filter((s) => s.atMs < BASELINE_MS);
  const results = challenges.map((challenge, i) => {
    const from = BASELINE_MS + i * CHALLENGE_MS;
    return verifyChallenge(challenge, baseline, samples.filter((s) => s.atMs >= from && s.atMs < from + CHALLENGE_MS));
  });
  const match = verifyMatch(samples);
  return { passed: checkPassed(results, match), results, match, ...(clip ? { clip } : {}) };
}
