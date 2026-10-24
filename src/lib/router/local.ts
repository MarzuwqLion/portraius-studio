// The visitor's own ComfyUI (spec: Local engine). Only client.ts imports this
// module. It speaks ComfyUI's HTTP API: prompts and jobs, uploads into the
// input folder, results from /api/view and the model folders for Settings.
// No key goes here, and nothing here talks to Comfy Router.
import type { LocalBody, LocalFile, LocalResult, LocalUpload } from "@/lib/registry/local-body";
import type { AppError } from "@/lib/types/errors";
import { base64ToBlob } from "./download";
import { appError } from "./errors";

export const DEFAULT_LOCAL_URL = "http://127.0.0.1:8188";

// ComfyUI files an outgoing prompt under this client ID, so the visitor can
// tell the app's runs from their own in ComfyUI's queue.
const CLIENT_ID = "portraius-studio";

let base: string | undefined;

export function setLocalUrl(url: string | undefined): void {
  base = url?.trim().replace(/\/+$/, "") || undefined;
}

export function localUrl(): string | undefined {
  return base;
}

function requireBase(): string {
  if (!base) throw appError("local_unreachable", "Set up your ComfyUI in Settings first.", { retry: "manual", action: "check_local" });
  return base;
}

function unreachable(url: string): AppError {
  return appError("local_unreachable", `Couldn't reach your ComfyUI at ${url}. Start it with --enable-cors-header, then retry.`, { retry: "manual", action: "check_local" });
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const url = requireBase();
  try {
    return await fetch(`${url}/api${path}`, { ...init, credentials: "omit" });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    // A refused connection and a CORS refusal look the same from here.
    throw unreachable(url);
  }
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

// ---- Errors ----

// Loader inputs whose value is a model file name.
const MODEL_INPUTS = new Set(["unet_name", "clip_name", "clip_name1", "clip_name2", "vae_name", "lora_name", "ckpt_name", "audio_encoder_name", "model_name", "name"]);

interface NodeError {
  type?: string;
  message?: string;
  details?: string;
  extra_info?: { input_name?: string; received_value?: unknown; class_type?: string };
}

interface PromptRefusal {
  error?: NodeError;
  node_errors?: Record<string, { errors?: NodeError[]; class_type?: string }>;
}

// Why /api/prompt refused a prompt, as a Contracts error (spec: Error mapping, local engine).
export function promptError(body: PromptRefusal, requestId?: string): AppError {
  const id = requestId ? { requestId } : {};
  if (body.error?.type === "missing_node_type") {
    const node = body.error.extra_info?.class_type ?? "a";
    return appError("local_node_missing", `Your ComfyUI doesn't have the ${node} node. Update ComfyUI, then retry.`, { action: "check_local", ...id });
  }
  for (const [, node] of Object.entries(body.node_errors ?? {})) {
    for (const e of node.errors ?? []) {
      const input = e.extra_info?.input_name ?? "";
      if (e.type === "value_not_in_list" && MODEL_INPUTS.has(input)) {
        const file = String(e.extra_info?.received_value ?? input);
        return appError("local_model_missing", `Your ComfyUI is missing ${file}. Settings lists where to get it.`, { action: "check_local", ...id });
      }
    }
  }
  const first = Object.values(body.node_errors ?? {}).flatMap((n) => (n.errors ?? []).map((e) => ({ node: n.class_type, e })))[0];
  const where = first?.node ?? "the prompt";
  const what = first ? `${first.e.message ?? ""}${first.e.details ? ` (${first.e.details})` : ""}` : (body.error?.message ?? "it refused the request");
  return appError("local_error", `Your ComfyUI stopped at ${where}: ${what}`, { retry: "manual", ...id });
}

interface ExecutionError {
  node_type?: string;
  exception_type?: string;
  exception_message?: string;
}

// Why a queued run failed.
export function executionError(e: ExecutionError | undefined, requestId: string): AppError {
  const message = e?.exception_message ?? "";
  if (/OutOfMemory/i.test(e?.exception_type ?? "") || /out of memory/i.test(message)) {
    return appError("local_out_of_memory", "Your GPU ran out of memory. Try a shorter clip, a smaller size or the faster model.", { retry: "manual", action: "edit_input", requestId });
  }
  const first = message.split("\n")[0]?.trim() || "it stopped with an error";
  return appError("local_error", `Your ComfyUI stopped at ${e?.node_type ?? "a node"}: ${first}`, { retry: "manual", requestId });
}

// ---- Jobs ----

type JobStatus = "pending" | "in_progress" | "completed" | "failed" | "cancelled";

interface Job {
  id: string;
  status: JobStatus;
  execution_error?: ExecutionError;
  outputs?: Record<string, Record<string, unknown>>;
}

// The job, or null when this ComfyUI doesn't know it.
async function getJob(id: string, signal?: AbortSignal): Promise<Job | null> {
  const response = await api(`/jobs/${encodeURIComponent(id)}`, { signal });
  if (response.status === 404) return null;
  if (!response.ok) throw appError("local_error", `Your ComfyUI answered ${response.status} for this job.`, { retry: "manual", requestId: id });
  return json<Job>(response);
}

// Whether ComfyUI has this prompt queued, running or finished. /jobs/{id}
// answers 404 for a new one, which the browser logs on every submit; history
// answers {} and the queue lists the rest.
async function hasPrompt(id: string, signal?: AbortSignal): Promise<boolean> {
  const history = await json<Record<string, unknown>>(await api(`/history/${encodeURIComponent(id)}`, { signal }));
  if (id in history) return true;
  const queue = await json<{ queue_running?: unknown[][]; queue_pending?: unknown[][] }>(await api("/queue", { signal }));
  return [...(queue.queue_running ?? []), ...(queue.queue_pending ?? [])].some((item) => item[1] === id);
}

function uploadBlob(upload: LocalUpload): Blob {
  return base64ToBlob(upload.data, upload.mime);
}

// Puts a file in ComfyUI's input folder under its own name.
export async function uploadInput(file: Blob, name: string, signal?: AbortSignal): Promise<string> {
  const form = new FormData();
  form.append("image", file, name);
  form.append("type", "input");
  form.append("overwrite", "true");
  const response = await api("/upload/image", { method: "POST", body: form, signal });
  if (!response.ok) throw appError("local_error", `Your ComfyUI didn't take the file ${name} (${response.status}).`, { retry: "manual" });
  const saved = await json<{ name: string; subfolder?: string }>(response);
  return saved.subfolder ? `${saved.subfolder}/${saved.name}` : saved.name;
}

export async function submit(body: LocalBody, options: { idempotencyKey: string; signal?: AbortSignal }): Promise<{ requestId: string }> {
  const id = options.idempotencyKey;
  // A repeat of a submit that already landed: ComfyUI has no idempotency
  // keys of its own, so look before queueing a second run.
  if (await hasPrompt(id, options.signal)) return { requestId: id };
  for (const upload of body.uploads) await uploadInput(uploadBlob(upload), upload.name, options.signal);
  const response = await api("/prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: body.prompt, prompt_id: id, client_id: CLIENT_ID }),
    signal: options.signal,
  });
  if (!response.ok) {
    const refusal = await json<PromptRefusal>(response).catch(() => ({}));
    throw promptError(refusal, id);
  }
  return { requestId: id };
}

export interface LocalStatus {
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED";
  completed: boolean;
  queuePosition: number | null;
}

// A job ComfyUI no longer knows counts as completed: result() then says why.
export async function status(id: string, signal?: AbortSignal): Promise<LocalStatus> {
  const job = await getJob(id, signal);
  if (!job || !["pending", "in_progress"].includes(job.status)) return { status: "COMPLETED", completed: true, queuePosition: null };
  if (job.status === "in_progress") return { status: "IN_PROGRESS", completed: false, queuePosition: null };
  return { status: "IN_QUEUE", completed: false, queuePosition: await queuePosition(id, signal) };
}

async function queuePosition(id: string, signal?: AbortSignal): Promise<number | null> {
  try {
    const response = await api("/queue", { signal });
    const queue = await json<{ queue_running?: unknown[][]; queue_pending?: unknown[][] }>(response);
    const pending = [...(queue.queue_pending ?? [])].sort((a, b) => Number(a[0]) - Number(b[0]));
    const index = pending.findIndex((item) => item[1] === id);
    return index < 0 ? null : index + 1 + (queue.queue_running?.length ?? 0);
  } catch {
    return null;
  }
}

const FILE_KEYS = ["images", "video", "videos", "gifs", "audio"];

function viewUrl(file: { filename: string; subfolder?: string; type?: string }): string {
  const query = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder ?? "", type: file.type ?? "output" });
  return `${requireBase()}/api/view?${query}`;
}

export function normaliseOutputs(outputs: Job["outputs"]): LocalResult {
  const result: LocalResult = { outputs: {} };
  for (const [node, media] of Object.entries(outputs ?? {})) {
    const files: LocalFile[] = [];
    const text: string[] = [];
    for (const [key, items] of Object.entries(media)) {
      if (!Array.isArray(items)) continue;
      if (key === "text") {
        for (const item of items) if (typeof item === "string") text.push(item);
        continue;
      }
      if (!FILE_KEYS.includes(key)) continue;
      for (const item of items) {
        if (!item || typeof item !== "object" || typeof (item as { filename?: unknown }).filename !== "string") continue;
        const f = item as { filename: string; subfolder?: string; type?: string };
        // Previews (type "temp") are what ComfyUI shows while it works, not results, and Load Video
        // reports the clip it loaded (type "input"): the visitor's own clip, not a recast of it.
        if (f.type === "temp" || f.type === "input") continue;
        files.push({ filename: f.filename, subfolder: f.subfolder ?? "", type: f.type ?? "output", url: viewUrl(f) });
      }
    }
    result.outputs[node] = { files, text };
  }
  return result;
}

export async function result(id: string, signal?: AbortSignal): Promise<LocalResult> {
  const job = await getJob(id, signal);
  if (!job) throw appError("local_lost", "Your ComfyUI restarted before this finished. Retry it?", { retry: "manual", requestId: id });
  if (job.status === "cancelled") throw appError("cancelled", "Cancelled.", { requestId: id });
  if (job.status === "failed") throw executionError(job.execution_error, id);
  return normaliseOutputs(job.outputs);
}

export async function cancel(id: string): Promise<void> {
  const response = await api(`/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST" });
  if (!response.ok) throw appError("local_error", `Your ComfyUI didn't cancel this (${response.status}).`, { retry: "manual", requestId: id });
}

// ---- Readiness, for Settings ----

export interface LocalCheck {
  version?: string;
  gpu?: string;
  vramGb?: number;
  installed: Record<string, string[]>;
}

export async function check(folders: readonly string[], signal?: AbortSignal): Promise<LocalCheck> {
  const stats = await api("/system_stats", { signal });
  if (!stats.ok) throw unreachable(requireBase());
  const s = await json<{ system?: { comfyui_version?: string }; devices?: { name?: string; type?: string; vram_total?: number }[] }>(stats);
  const device = s.devices?.find((d) => d.type !== "cpu") ?? s.devices?.[0];
  const installed: Record<string, string[]> = {};
  for (const folder of folders) {
    const response = await api(`/models/${encodeURIComponent(folder)}`, { signal });
    installed[folder] = response.ok ? await json<string[]>(response) : [];
  }
  return {
    ...(s.system?.comfyui_version ? { version: s.system.comfyui_version } : {}),
    ...(device?.name ? { gpu: device.name } : {}),
    ...(device?.vram_total ? { vramGb: Math.round(device.vram_total / 1024 ** 3) } : {}),
    installed,
  };
}
