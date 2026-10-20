// Router calls that never become jobs, so nothing here touches a job's status.
//
// - ElevenLabs answers only on the synchronous route, with the audio itself,
//   so a spoken line is one direct call whose bytes go straight into the
//   blobs table (Marzuwq's M7 call: speech stays outside the state machine).
// - The Director agent's plan is a few lines of text, not an asset. It's
//   queued, as every model that supports the queue is, and collected here;
//   the caller keeps the request ID so a reload can collect it again.
//
// Failures come back as plain Errors carrying the Contracts message and the
// request ID, ready to show.
import { adapterFor, requestBody } from "@/lib/registry/adapters";
import type { BinaryResult } from "@/lib/registry/capabilities";
import * as router from "@/lib/router/client";
import { downloadAsset } from "@/lib/router/download";
import { appError, errorText, toAppError } from "@/lib/router/errors";
import { db } from "@/lib/store/db";
import type { AssetKind } from "@/lib/types/records";
import { timing } from "./runner";

function plain(err: unknown): Error {
  return new Error(errorText(toAppError(err)));
}

export interface SavedAsset {
  blobId: string;
  kind: AssetKind;
  mime: string;
  bytes: number;
}

// Runs a synchronous model (never with a fallback provider) and saves what it
// returns under `prefix:<uuid>` blob IDs.
export async function runAndSave(modelId: string, input: unknown, prefix: string, signal?: AbortSignal): Promise<{ assets: SavedAsset[]; requestId: string | null }> {
  const adapter = adapterFor(modelId);
  if (adapter.delivery !== "sync") throw new Error(`${modelId} goes on the queue.`);
  const body = adapter.buildBody(input);
  let res: router.SyncResult;
  try {
    res = await router.run(modelId, body, { idempotencyKey: crypto.randomUUID(), ...(signal ? { signal } : {}) });
  } catch (err) {
    throw plain(err);
  }
  const raw = res.kind === "binary" ? ({ bytes: res.data as Uint8Array, contentType: res.contentType ?? "" } satisfies BinaryResult) : res.data;
  const refs = adapter.extractAssets(raw);
  if (!refs.length) throw plain(appError("no_output", "The model finished without returning a file. Try again?", { retry: "manual", ...(res.requestId ? { requestId: res.requestId } : {}) }));
  const assets: SavedAsset[] = [];
  for (const ref of refs) {
    const blob = await downloadAsset(ref, signal);
    const asset = { blobId: `${prefix}:${crypto.randomUUID()}`, kind: ref.kind, mime: blob.type, bytes: blob.size };
    await db.blobs.put({ id: asset.blobId, blob, mime: asset.mime, bytes: asset.bytes });
    assets.push(asset);
  }
  return { assets, requestId: res.requestId };
}

// Submits to the queue and returns the request ID, for collect().
export async function submitDirect(modelId: string, input: unknown): Promise<string> {
  const body = requestBody(modelId, input);
  try {
    return (await router.submit(modelId, body, { idempotencyKey: crypto.randomUUID() })).requestId;
  } catch (err) {
    throw plain(err);
  }
}

// Waits for a queued request and returns its native result.
export async function collectDirect(modelId: string, requestId: string, signal?: AbortSignal): Promise<unknown> {
  let failures = 0;
  for (;;) {
    signal?.throwIfAborted();
    try {
      const s = await router.status(modelId, requestId, signal);
      if (s.completed) return (await router.result(modelId, requestId, signal)).data;
      failures = 0;
      await timing.sleep(Math.min(Math.max(s.retryAfterMs ?? timing.pollMs, timing.pollMs), timing.maxPollMs));
    } catch (err) {
      const error = toAppError(err);
      if ((error.code === "network_error" || error.retry === "auto") && failures < 5) {
        await timing.sleep(Math.min((error.retryAfter ?? 0) * 1000 || timing.backoffMs(failures++), timing.maxPollMs));
        continue;
      }
      throw new Error(errorText(error));
    }
  }
}
