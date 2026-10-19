# Portraius Studio — Build Spec

Oct 19, 2026 · @Marzuwq Muhammad

## Overview

Portraius Studio is an open-source, local-first studio where people turn their own photos into reusable character files, then make images, videos and recasts with them. It is built on the Comfy Developer Platform for Comfy's Open Source Higgsfield competition, due **October 30, 2026 at 9:00am PT**. Winners are announced November 6.

The app has five areas, and every generation works with or without a character:

- **Characters**: create, verify, export and import portable character files.
- **Image**: text-to-image and image editing, optionally with characters and elements.
- **Video**: text-to-video and image-to-video, optionally with characters, with a cheap draft pass before the final render.
- **Recast**: the Genjutsu rebuild. Swap a character into an existing clip while keeping its motion, or swap one object.
- **Director**: the Cinema Studio rebuild. Camera and lens controls, a shot list, anchor frames, a draft per shot and one exported scene.

### Contest requirements and how we meet them

| Requirement | How this build meets it |
| --- | --- |
| Built on the Comfy Developer Platform (Comfy API, Comfy Router and/or Comfy SDK) | All generation goes through Comfy Router via the Comfy SDK. Optional workflows run on a Comfy API deployment. |
| A working app with a usable interface and example outputs, not a workflow export | Static web app (Vite + React) plus a `samples/` folder of real outputs. |
| Repo with app code, workflow files, an open-source license and local setup steps | MIT license, `workflows/` folder, README that gets a stranger running in under 10 minutes. |
| Demo video, 2 minutes or less | Recorded by Marzuwq after testing. A draft script is in the Submission section. |
| Link to try it (optional, strongly encouraged) | GitHub Pages site where judges paste their own Comfy API key, plus a no-key Tour mode. |
| Demo posted on a social platform with #OpenSourceHiggsfield | Post on X, Instagram (@ai\_reflections) and LinkedIn. |
| Lawful, SFW, no unlicensed IP or likenesses | Consent check on every character, own or licensed footage only, provider safety settings left on. |

### Prize targets

- **Grand Prize ($10,000)**: the primary target. Every entry is considered.
- **Most Innovative (RTX 5090)**: portable character files, identity match scoring, and the ComfyUI node pack. The demo video must say plainly why the entry is innovative.
- **Most Viral (RTX 5090)**: Recast plus remix links.
- **Not targeted by default**: Open Weights Only (needs zero partner APIs) and the LTX, FLUX 3 and MiniMax H3 bonuses (each needs that model as the core model). Both were decided against on October 19.

The guiding principle: a multi-model image and video suite is table stakes, since several open "Higgsfield clones" already exist. What wins is the character file as the spine of the two tools Comfy named, plus things a closed platform can't offer: files you own, consent built in, a measurable identity score, and presets anyone can contribute.

## Decisions and defaults

Marzuwq settled every open decision on October 19. Claude Code builds to these; nothing in this section is open.

### Decisions (October 19)

| Decision | Answer |
| --- | --- |
| Name | Portraius Studio. Repo `portraius-studio`. |
| Video models | Seedance 2.5 is the default and core video model. MiniMax H3 ships as the second selectable video model (useful for its 2K output). H3 is not the core model, so the H3 bonus isn't pursued. |
| Open weights | Not pursued. No open-weights profile, no Open Weights Only entry. |
| Hosting | GitHub Pages, as a static site. See Architecture for what that changes. |
| Keys | The visitor's own Comfy API key, plus a no-key Tour mode with pre-made samples. |
| Demo video | Marzuwq records it after testing. Not part of Claude Code's milestones. |
| Sample character | Marzuwq provides it after everything else is built. Until then, build and test with designed characters. |

### Defaults

- **Stack:** Vite + React + TypeScript, built as a static site. Node 22 or newer for local dev and scripts.
- **Router access:** `@comfyorg/sdk` (0.5.0 on npm today) if it bundles and runs in the browser; its package declares Node 22+, so M1 checks. Otherwise a small `fetch` client over the documented Router REST routes.
- **Image model:** Nano Banana 2.1, `vertexai/gemini-nano-banana-2.1`. Never `vertexai/gemini-3.1-flash-image` or the `*-nano-banana-2` partner IDs: Nano Banana 2 shuts down October 29, one day before the deadline.
- **Video models:** Seedance 2.5 (`byteplus/dreamina-seedance-2-5-260628`) by default; MiniMax H3 (`minimax/minimax-h3`) selectable.
- **Users:** single user, local-first. No accounts and no backend of our own.
- **License:** MIT, same as both Comfy example repos.
- **Entries:** one submission (the earlier version of this challenge allowed one per person).

## Scope and priorities

P0 is the entry: if only P0 ships, the demo still shows every reason the entry should win. P1 makes it clearly better than other entries. P2 is stretch work, cut first if the schedule slips.

| Feature | Tier | Why it is in this tier |
| --- | --- | --- |
| App shell, Settings (visitor key), model registry, Router client with queue and auto-download | P0 | Everything else depends on it |
| Character vault: create from photos, turnaround sheet, consent check, export and import | P0 | The core idea and the main innovation claim |
| Image studio, with and without characters | P0 | Table stakes for a full suite |
| Video studio: Seedance 2.5 with draft then final, MiniMax H3 selectable | P0 | Table stakes, plus a visible cost advantage |
| Recast (motion transfer and object swap) | P0 | Rebuilds Genjutsu, which Comfy named. Comfy's own "Openjutsu" is coming, so the vault, consent and presets are the edge. |
| Identity match score with auto-retry | P0 | A hard number for the demo and the innovation pitch |
| Local library of all outputs | P0 | Router links expire within 12 to 24 hours |
| GitHub Pages deploy, Tour mode, README, ComfyUI workflow files | P0 | Submission requirements |
| Director: camera controls, shot list, anchors, one draft per shot, stitched scene export | P1 | Rebuilds Cinema Studio, the other named app |
| Cost estimate shown before each run | P1 | Cheap to add, strong contrast with credit-metered platforms |
| Elements: outfits, props, locations saved like characters | P1 | Same file format as characters, small extra work |
| Realism finishing pass | P1 | Quality edge on portraits |
| Presets as JSON files plus remix recipes | P1 | The Most Viral loop and the open-source story |
| Director chaining (a shot starts from the previous shot's last frame) and Kling one-take multi-shot | P2 | Nice continuity, but every cut works without it |
| Voice and lip sync | P2 | Shareable, but adds two more models and media hosting |
| Director agent (an LLM drafts the shot list) | P2 | Nice to have once Director works by hand |
| ComfyUI custom node pack | P2 | Strong for Most Innovative but real extra scope |
| Sample character, `samples/`, demo video | Last | Marzuwq provides these after everything else is built and tested |

If the schedule slips, cut in this order: node pack, voice and lip sync, Director agent, Director chaining, then Elements.

## Architecture

A static single-page app hosted on GitHub Pages, with no backend of our own. The browser holds the visitor's key, calls Comfy Router directly, and keeps all user data in IndexedDB. Two things could force a small optional proxy, and M1 tests both on day one.

### Libraries

- Build: Vite + React + TypeScript. React Router with `HashRouter`, since GitHub Pages has no server-side routing.
- UI: Tailwind CSS + shadcn/ui, Zustand for client state, TanStack Query for job polling.
- Storage: Dexie (IndexedDB wrapper). Character files: JSZip.
- Media: ffmpeg.wasm with the single-thread core. GitHub Pages can't send cross-origin isolation headers, so the multi-thread core won't load. Self-host the core files in `public/ffmpeg/` (about 31 MB, under GitHub Pages' 100 MB per-file limit).
- Face matching: `@vladmandic/face-api` (MIT), weights in `public/models/`. See the Identity section.
- Validation: zod.

### What the browser does

- **Router client** (`lib/router/client.ts`): submit, status, result, cancel, estimate and run. Checks every model ID against the registry allowlist and attaches the visitor's key. The only module that talks to Comfy.
- **Media prep:** every image is resized to a 2048 px long edge max, saved as JPEG quality 90, with EXIF stripped (removes GPS location). Clips are trimmed to each model's limits with ffmpeg.wasm.
- **Media hosting** (`lib/media/host.ts`): gets a short-lived public URL for inputs that must be URLs (any video sent to Seedance, Kling's edit input, every Sync-3 input).
- **Downloads:** fetches every result asset and saves it as a Blob.
- **Identity:** computes face descriptors locally.
- **Storage:** characters, jobs, generations and recipes in IndexedDB.

### SDK in the browser (checked October 19)

In `@comfyorg/sdk` 0.5.0, the Router client (the `comfy` namespace) pulls in exactly one Node built-in: `node:crypto`, for `randomUUID`. The Cloud client (the `Comfy` class with assets, workflows and outputs) also imports `node:fs`, `node:path` and `node:stream`, so the app never imports it.

- In `vite.config.ts`, alias `node:crypto` to `src/shims/node-crypto.ts` (`export const randomUUID = () => globalThis.crypto.randomUUID();`). Alias `node:fs`, `node:fs/promises`, `node:path`, `node:stream` and `node:stream/promises` to an empty module.
- Configure once with `comfy.config({ credentials: key, baseUrl })`. `baseUrl` is how the app points at the Worker if M1 needs it.
- `models.run` accepts `fallbackProvider`, `modelProvider`, `idempotencyKey`, `signal` and `timeoutMs`. `models.submit` accepts `idempotencyKey`, `retry`, `signal` and `timeoutMs` (the queue has no provider fallback). There's no estimate method, so `/estimate` is a plain `fetch`.
- Errors come from `@comfyorg/sdk/errors`: subclasses of `RouterError` carrying `errorType`, `requestId`, `httpStatus` and `retryAfter`. The mapping is in Contracts.

### Day-one risks (M1 spikes)

| Risk | Test from `localhost` | If it fails |
| --- | --- | --- |
| Browser CORS on `api.comfy.org` | `GET /v2/models`, then a queued Nano Banana 2.1 submit, a status poll and a result read | Worker `/router/*` pass-through, with `comfy.config({ baseUrl: WORKER_URL + "/router" })` |
| Public URLs for video inputs. Seedance takes video only as a URL or asset ID; Kling's edit input and Sync-3 need URLs. | Upload a small MP4 with `POST https://cloud.comfy.org/api/v2/assets` (multipart fields `file`, `content_type`, `file_path`, optional `expires_in`), then pass the returned `url` to a Seedance `reference_video` draft. The docs don't say whether that URL is public, how long it lives, or whether a Router key can use Cloud's asset store. | Worker `/upload` backed by R2 |
| Downloading result assets | Fetch a Comfy-rehosted link, a Freepik link and a Sync Labs link from the browser | Worker `/fetch?url=` with a host allowlist |
| Readable response headers | Read `X-Comfy-Request-Id`, `X-Comfy-Error-Type`, `Retry-After` and `X-Comfy-Credits-Used` | The SDK falls back to the body for request IDs; hide the credits figure |

### The Worker (built only if a spike fails)

`proxy/` is one Cloudflare Worker (TypeScript, deployed with `wrangler` on the free tier by Marzuwq). It never stores a key.

| Route | What it does | Guards |
| --- | --- | --- |
| `ALL /router/*` | Forwards to `https://api.comfy.org/*` with the caller's `X-API-Key`; copies back status, body and the Comfy headers; adds CORS for the Pages origin | Path must start `/v2/models/`; model ID must be on the app's allowlist (shared JSON file) |
| `POST /upload` | Streams the file into R2 under a random key and returns `{ url, expiresAt }` | Caller's key checked once with `GET /v2/models?limit=1` and cached 10 minutes; 100 MB cap; MIME allowlist (mp4, mov, wav, mp3, png, jpeg) |
| `GET /m/:key` | Serves the R2 object publicly so providers can fetch it | Unguessable 128-bit key |
| `DELETE /m/:key` | The app deletes each upload as soon as its job finishes | Same key check as upload |
| `GET /fetch?url=` | Streams a result asset back with CORS headers | `https` only; host allowlist from the M1 findings |

Every route limits CORS to the GitHub Pages origin and `localhost`, rate-limits each IP to 30 requests a minute, and an R2 lifecycle rule deletes anything older than 1 day (R2 rules count in whole days).

### Key handling

The visitor pastes a key in Settings. It lives in `sessionStorage` by default; "Remember on this device" is opt-in and uses IndexedDB. Local development works the same way: `npm run dev`, then paste a key. The key is only ever sent to `api.comfy.org` (or the Worker, if M1 adds it). Because anything running on the page could read the key, the site loads no analytics or third-party scripts, and a Content-Security-Policy meta tag limits network connections to Comfy and the asset hosts.

### Repo layout

```
portraius-studio/
  src/
    routes/       characters | image | video | recast | director | library | settings | remix | tour
    components/
    lib/
      router/     client.ts, errors.ts, download.ts
      jobs/       machine.ts, runner.ts, hooks.ts
      registry/   models.ts, capabilities.ts, schemas/   (types generated from Router OpenAPI)
      adapters/   nano-banana.ts, seedance.ts, minimax-h3.ts, kling-omni.ts,
                  freepik-skin.ts, elevenlabs.ts, sync3.ts
      characters/ format.ts, sheet.ts, consent.ts
      identity/   embed.ts, score.ts
      prompts/    camera.ts, compile.ts
      store/      db.ts, library.ts
      media/      image-prep.ts, video-prep.ts, stitch.ts, host.ts
  public/         models/ (face-api weights), ffmpeg/, samples/ (Tour mode)
  presets/        camera/*.json, recast/*.json, looks/*.json, image/*.json, video/*.json
  workflows/      *.json, *.api.json, README.md
  custom_nodes/   comfyui-portraius-characters/   (P2)
  proxy/          Cloudflare Worker, only if M1 needs it
  scripts/        gen-schema-types.ts, smoke.ts
  test/
  .github/workflows/  pages.yml, presets-check.yml
```

The diagram below shows how a generation request moves through these parts.

```
Browser (GitHub Pages)                         Comfy Router        Provider
Studio UI -> Router client ------------------> Router queue -----> Native provider
(prompt,     (allowlist,                       (request_id,        (Google, BytePlus,
 image prep)  visitor's key)                    estimate)           MiniMax, Kling)
                                                     |                   |
Library   <- Download      <------------------- Collect result <---------+
(Blob in      (fetches expiring                (polls status,      result
 IndexedDB,    asset bytes)                     honours Retry-After)
 scored)
```

No backend. A Cloudflare Worker sits before Router only if M1 finds browser calls blocked.

The request runs left to right along the top. The result comes back right to left: collected from the queue, its bytes fetched before the link expires, then saved and scored in the browser.

## Model registry and Comfy Router integration

Every model is reached through one registry entry plus one adapter, and nothing else in the app knows a model ID. Generations go through Router's queue so they survive reloads, never hit the 10-minute synchronous cutoff, and are always served by the model's native provider.

### Registry

| Capability | Model ID | Delivery | How media goes in | Where the result is |
| --- | --- | --- | --- | --- |
| Character sheet, image generate, image edit | `vertexai/gemini-nano-banana-2.1` | Queue | Base64 in `contents[].parts[].inlineData` (Google caps each part at 20 MB) | Base64 in `candidates[0].content.parts[].inlineData`, or `fileData.fileUri` if a partner served it. Branch on which key is present. |
| Video generate (default, core model) | `byteplus/dreamina-seedance-2-5-260628` | Queue | `content[]` items. Images and audio as URL or data URI; video only as a URL or `asset://` ID. Roles: `first_frame`, `last_frame`, `reference_image`, `reference_video`, `reference_audio` | `content.video_url` and `content.last_frame_url`, rehosted for up to 24 h |
| Video generate (selectable, 2K) | `minimax/minimax-h3` | Queue | `content[]` items as URL or data URI. Keyframe roles and `reference_*` roles can't be mixed. 4 to 15 s, `768P` or `2K`, no draft mode | `task.content.url`, rehosted for 12 h |
| Multi-shot and video edit | `kling/kling-v3-omni` | Queue | `image_list` as base64 or URL (refs or first/end frame); `video_list` as URL only, with `refer_type: "base"` to edit one 3 to 10 s clip; `multi_shot` with up to 6 shots | `data.task_result.videos[].url` |
| Realism pass | `freepik/ai-skin-enhancer-faithful` | Queue | `image` as base64 or HTTPS; `skin_detail`, `sharpen`, `smart_grain` | `data.generated[]`. Freepik's own links, not rehosted. |
| Voice | `elevenlabs/eleven_v4` | Sync only (returns raw audio bytes) | `inputs[]` of `{text, voice_id}`. Stock voices only; this route has no voice cloning. | The response body is the audio |
| Lip sync | `synclabs/sync-3` | Queue | Public URLs only: one video or image plus one audio | `outputUrl`. Sync Labs' own link, not rehosted. |
| Director agent (P2) | `anthropic/claude-sonnet-5-5` | Sync | Text | Text |
| Identity second opinion (optional) | `vertexai/gemini-3.8-flash` | Sync | Base64 images | Text (JSON verdict) |

### Adapter contract

UI code talks in app-level inputs (`GenerateImageInput`, `GenerateVideoInput`, `RecastInput`). Each adapter turns those into the model's native body and pulls assets out of the native result. Swapping the default video model is a one-line registry change.

```ts
export type Capability =
  | "image.generate" | "image.edit" | "character.sheet"
  | "video.generate" | "video.edit" | "video.multishot"
  | "image.enhance" | "audio.tts" | "video.lipsync" | "text.plan" | "vision.judge";

export interface AssetRef {
  kind: "image" | "video" | "audio" | "frame";
  url?: string;        // expiring link, download immediately
  base64?: string;     // inline bytes
  mime?: string;
}

export interface ModelAdapter<I, Raw> {
  id: `${string}/${string}`;           // canonical Router model ID
  capabilities: Capability[];
  delivery: "queue" | "sync";
  limits: { maxRefImages?: number; durationSec?: [number, number]; resolutions?: string[] };
  buildBody(input: I): unknown;         // app input -> model-native JSON
  extractAssets(raw: Raw): AssetRef[];  // native result -> assets to download
}
```

### Rules for every call

1. **Queue everything that can be queued.** Use `comfy.models.submit(modelId, body)`, save `{modelId, requestId}` on a job record in IndexedDB, poll the status route honouring `Retry-After`, then collect with `handle.get()`. After a reload, rebuild the handle with `comfy.models.handle(modelId, requestId)`. Results are kept 24 hours after completion.
2. **Keep Higgsfield out of the path.** Router lists Higgsfield as an alternate provider for Seedance 2.5, Kling V3 and Wan 3.0. Never send `model_provider`. Queued submits have no fallback loop, so the native provider always serves them. For synchronous calls, add `fallback_provider=false`. The registry allowlist rejects any `higgsfield/*` ID.
3. **Download on completion.** The browser fetches each `AssetRef` (through the Worker only for hosts M1 finds blocked) and saves it as a Blob. Never store a provider URL as the asset; they expire in 12 to 24 hours or sooner.
4. **Show cost before running.** Call `POST /v2/models/{id}/estimate` with the exact body. Show `amount` when `source` is `exact`, the range when `estimated`, and "price unknown" otherwise. The route may answer `403 not_enabled` while it rolls out; hide the figure then. Save the `estimate` from the submit response on the job.
5. **Errors.** Branch on `error_type`, never on `detail`. Treat unknown values as `internal_error`. Always show `X-Comfy-Request-Id` in the error message.

| `error_type` | What the user sees |
| --- | --- |
| `content_policy_violation` | "The provider declined this." Plus which side (`refusal_subject`) and, from the catalog's `billing.charges_on_policy_rejection`, whether it was charged |
| `invalid_input` | The field paths from `detail[].loc`, mapped to form fields |
| `insufficient_credits` | Link to add credits on platform.comfy.org |
| `rate_limited`, `concurrency_limit_exceeded`, `queue_backlog_full` | Automatic back-off and retry, shown as "waiting in line" |
| `provider_timeout`, `queue_timeout`, `provider_error` | One-click retry under a new key |

6. **Media encoding.** Images and audio go as data URIs after browser prep. Router caps a request body at 100 MiB (about 75 MB of raw media after base64), and Google caps each inline part at 20 MB. Videos always go as a short-lived public URL from `lib/media/host.ts`.
7. **Types from schemas.** `scripts/gen-schema-types.ts` fetches `GET /v2/models/{id}/openapi.json` for each registry model, caches it by `ETag`, and generates TypeScript types into `lib/registry/schemas/`. Adapters are typed against those, so a schema change breaks the build instead of a demo.
8. **SDK gaps.** If `@comfyorg/sdk` doesn't run in the browser, or can't send a query parameter the app needs (`fallback_provider`), call the documented REST routes with `fetch` and the same headers, inside `lib/router/client.ts` only.

## Unknowns and fallbacks

Every assumption this spec couldn't verify, where it gets checked, and what to build if it turns out false. Claude Code applies the fallback without stopping, unless the row says STOP AND ASK.

| # | Assumption | Checked in | If it's false |
| --- | --- | --- | --- |
| 1 | The browser can call `api.comfy.org` (CORS) | M1 | STOP AND ASK, then build the Worker's `/router/*` route |
| 2 | Comfy Cloud's asset upload accepts a Router key and returns a URL providers can fetch | M1 | STOP AND ASK, then build the Worker's `/upload` route on R2 |
| 3 | Result asset hosts allow browser downloads | M1 | Worker `/fetch` for the hosts that don't |
| 4 | Comfy's response headers are readable from the browser | M1 | Request IDs from the body; hide the "spent this session" figure |
| 5 | The SDK's Router client runs in the browser with the `node:crypto` shim | M1 | A `fetch` client over the documented REST routes, with the same function names |
| 6 | `/estimate` is enabled for the key | M1 | Use the `estimate` on the submit response; otherwise show "price unknown" |
| 7 | Nano Banana 2.1 accepts `thinkingLevel` `MINIMAL` and `HIGH` | M3 | Drop `thinkingConfig`; Quality maps to size only (Fast is 1K, Best is 2K) |
| 8 | Seedance 2.5 accepts `first_frame` together with `reference_image` | M3 | Keep them separate (already the default); Still first carries identity through the frame |
| 9 | A Seedance final render returns `last_frame_url` | M3 | Extract the last frame with ffmpeg.wasm |
| 10 | Motion Transfer accepts `duration: -1` | M4 | Send the clip's length, clamped to 4 to 30 s |
| 11 | Kling V3 Omni Object Swap quality is good enough | M4 | Use the A/B winner; STOP AND ASK only if none of the four is usable |
| 12 | Webcam yaw detection is reliable in ordinary lighting | M2 | Drop the turn prompts; the pool becomes blink twice, smile, look up, open mouth |
| 13 | face-api separates same and different people on generated faces (2 or fewer errors in 40 pairs) | M5 | Switch the score to the `vertexai/gemini-3.8-flash` judge, labelled "AI judge", with bands from its confidence |
| 14 | face-api's weights can be redistributed in the repo | M5 | Load the weights at runtime from the author's release URL (add that host to the CSP) and note it in the README |
| 15 | Single-thread ffmpeg.wasm stitches a 3-shot 1080p scene in under 2 minutes | M6 | Stream-copy concat (`-c copy`) when every shot shares codec and size; otherwise stitch at 720p |
| 16 | ElevenLabs stock voice IDs work through Router | M7 | Drop voice and lip sync |
| 17 | Sync-3 lip sync looks right | M7 | Use the Seedance `reference_audio` path instead |

## Data model and local-first storage

A character is a single portable file (`.portraius`, a zip) that the user can export, import, fork and back up. Inside the app the same data lives in IndexedDB. Recipes share how something was made without ever carrying a face.

### Character file layout

```
alex.portraius            (zip)
  character.json
  photos/001.jpg ...      3 to 10 prepared source photos
  sheet/turnaround.png    one composite sheet (the main reference)
  sheet/front.png, three-quarter.png, profile.png, full-body.png, expressions.png
  identity/face.json      face descriptors used for scoring
  consent/consent.json    required for kind = "person"
  consent/check.webm      optional; the user chooses whether it is included on export
  thumb.jpg
```

Elements (outfits, props, locations, styles) use the same format with `kind: "element"` and no identity or consent folders.

### `character.json`

```ts
export type CharacterFile = {
  format: "portraius.character";
  version: 1;
  id: string;                         // uuid
  kind: "person" | "element"; origin: "photos" | "designed";
  elementType?: "outfit" | "prop" | "location" | "style";
  name: string;
  description: string;                // user-written, inserted into prompts
  createdAt: string;
  updatedAt: string;
  photos: { path: string; width: number; height: number }[];
  sheet: {
    composite: string;
    views: { front: string; threeQuarter: string; profile: string; fullBody: string; expressions?: string };
    model: string;                    // model ID that drew it
  };
  identity?: { descriptors: number[][]; mean: number[]; model: string; threshold: number };
  consent?: ConsentRecord;            // generation is blocked for a person without it
  voice?: { provider: "elevenlabs"; voiceId: string; label: string };
  tags: string[];
};

export type ConsentRecord = {
  subjectName: string;
  method: "self-check";
  statement: string;                  // the exact text the subject accepted
  acceptedAt: string;
  challenge: string[];                // e.g. ["turn-left", "smile", "look-up"]
  checkClip?: string;                 // path inside the zip, if kept
  matchScore: number;                 // check clip face vs source photos
  appVersion: string;
};
```

### IndexedDB tables (Dexie)

| Table | Holds | Key fields |
| --- | --- | --- |
| `characters` | Characters and elements, with their images as Blobs | `id`, `kind`, `name`, `updatedAt` |
| `jobs` | In-flight and recent Router requests | `id`, `modelId`, `requestId`, `status`, `estimate`, `createdAt` |
| `generations` | Finished outputs, with assets as Blobs | `id`, `type` (image, video, recast, scene), `modelId`, `characterIds[]`, `recipeId`, `identityScore`, `createdAt` |
| `recipes` | Saved and imported recipes | `id`, `capability`, `source` (preset, mine, remix) |
| `settings` | Key handling choice, default models, UI preferences | single row |

On first run, call `navigator.storage.persist()` so the browser doesn't evict the library, and show used space from `navigator.storage.estimate()` in Settings. The library can be exported as one zip.

### Recipe format

```json
{
  "format": "portraius.recipe",
  "version": 1,
  "capability": "video.generate",
  "model": "byteplus/dreamina-seedance-2-5-260628",
  "slots": [{ "slot": "lead", "kind": "person" }, { "slot": "outfit", "kind": "element" }],
  "prompt": "{lead} walks out of a neon-lit diner wearing {outfit}, rain on the pavement",
  "camera": { "preset": "slow-push-in", "lens": "35mm", "aperture": "f/2" },
  "params": { "duration": 8, "ratio": "9:16", "generate_audio": true },
  "seed": 1234
}
```

A recipe never contains photos, sheets, descriptors or consent. Characters become named slots that the person remixing fills with their own characters. Share links carry the recipe in the URL fragment (`#/remix?r=<base64url of compressed JSON>`), so a shared recipe never touches a server.

## Contracts

These are the shapes and boundaries Claude Code must not improvise. Changing one is a spec change, not an implementation detail.

### Routes and screens (`HashRouter`)

| Route | Screen | Notes |
| --- | --- | --- |
| `#/` | First run | Sends returning users to `#/characters` once a key and one character exist |
| `#/characters` | Vault grid |  |
| `#/characters/new` | Create wizard (from photos, or design from text) | 5 steps; an unfinished wizard resumes from IndexedDB |
| `#/characters/:id` | Character detail | Sheet, views, redraw, export |
| `#/image` | Image studio | `?recipe=<id>` preloads a preset |
| `#/video` | Video studio | `?from=<generationId>` sets the first frame |
| `#/recast` | Recast |  |
| `#/director`, `#/director/:sceneId` | Director (P1) |  |
| `#/library`, `#/library/:generationId` | Library and detail |  |
| `#/remix?r=<recipe>` | Remix |  |
| `#/tour` | Tour | No key needed |
| `#/settings` | Settings |  |

### Module boundaries

| Module | May import | Must not import |
| --- | --- | --- |
| `routes/*`, `components/*` | `lib/*` hooks and types | `@comfyorg/sdk`, `lib/router` internals |
| `lib/jobs` (runner and state machine) | `lib/router`, `lib/registry`, `lib/store`, `lib/media`, `lib/identity` | React |
| `lib/router` | `@comfyorg/sdk`, `@comfyorg/sdk/errors`, `lib/registry` | `lib/store` |
| `lib/adapters/*` | `lib/registry/schemas`, `lib/prompts` | Anything that makes a network call |
| `lib/store` | Dexie | Anything that makes a network call |

### Job state machine

Only `lib/jobs/machine.ts` changes a job's `status`. The UI reads jobs through a `useJob(id)` hook built on Dexie `liveQuery`.

```ts
export type JobStatus =
  | "submitting" | "queued" | "running" | "downloading" | "scoring"
  | "done" | "failed" | "cancelling" | "cancelled" | "expired";

export interface Job {
  id: string;                    // uuid
  kind: "sheet" | "image" | "video" | "recast" | "enhance" | "tts" | "lipsync" | "shot";
  modelId: string;
  requestId?: string;            // set from the 201
  idempotencyKey: string;        // minted before submit, reused only for a retry of the same submit
  input: unknown;                // app-level input, for retries and recipes
  estimate?: { source: "exact" | "estimated" | "unknown"; amountCents?: number; minCents?: number; maxCents?: number };
  status: JobStatus;
  queuePosition?: number;
  rawResult?: unknown;           // native result, kept until every asset is saved
  error?: AppError;
  parentJobId?: string;          // draft to final, and automatic retries
  draftTaskId?: string;          // Seedance draft id, valid 7 days
  uploads?: string[];            // hosted media to delete when the job ends
  generationIds: string[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}
```

| From | Event | To |
| --- | --- | --- |
| (new) | Submit sent | `submitting` |
| `submitting` | `201` with a `request_id` | `queued` |
| `submitting` | Error before a `201` | `failed` |
| `queued` | Status `IN_PROGRESS` | `running` |
| `queued`, `running` | `COMPLETED` with no `error_type` | `downloading` (save `rawResult` first) |
| `queued`, `running` | `COMPLETED` with an `error_type` | `failed`, or `cancelled` when the type is `cancelled` |
| `queued`, `running` | User cancels | `cancelling`, then `cancelled`, or `downloading` if the run finished anyway |
| `downloading` | Every asset saved | `scoring` if a cast member is in it, else `done` |
| `scoring` | Scores saved | `done` |
| `downloading`, `scoring` | Step fails | Retry up to 3 times with backoff, then `failed` (`download_failed` or `scoring_failed`) |
| `queued`, `running`, `downloading` | `410`, or more than 24 h since completion | `expired` |
| Any non-final state | Page reload | `submitting` with no `requestId` becomes `failed` (`lost_before_submit`); `queued` and `running` rebuild the handle with `comfy.models.handle(modelId, requestId)`; `downloading` and `scoring` rerun from `rawResult` |

When a job reaches `done`, `failed`, `cancelled` or `expired`, delete its `uploads`.

### IndexedDB schema (Dexie)

```ts
export class StudioDB extends Dexie {
  characters!: Table<CharacterRecord, string>;
  jobs!: Table<Job, string>;
  generations!: Table<Generation, string>;
  recipes!: Table<RecipeRecord, string>;
  blobs!: Table<{ id: string; blob: Blob; mime: string; bytes: number }, string>;
  settings!: Table<Settings, string>;

  constructor() {
    super("portraius-studio");
    this.version(1).stores({
      characters: "id, kind, name, updatedAt",
      jobs: "id, status, modelId, createdAt, parentJobId",
      generations: "id, type, modelId, createdAt, *characterIds, recipeId, identityScore",
      recipes: "id, capability, source, updatedAt",
      blobs: "id",
      settings: "id",
    });
  }
}
```

Records hold blob IDs, never Blobs, so lists stay fast. Once a version has shipped to GitHub Pages it is never edited: schema changes add `this.version(n + 1)` with an `upgrade()` function.

### Error mapping

```ts
export interface AppError {
  code: string;                  // RouterError.errorType, or an app code such as download_failed or consent_required
  message: string;               // plain language, shown to the user
  requestId?: string;
  refusalSubject?: string;
  retry: "auto" | "manual" | "never";
  action?: "add_credits" | "check_key" | "edit_input" | "wait";
}
```

| SDK error (`@comfyorg/sdk/errors`) | Retry | Action | Message |
| --- | --- | --- | --- |
| `InvalidInput` | never | `edit_input` | "This model didn't accept: {fields}." |
| `ContentPolicyViolation` | never | `edit_input` | "The provider declined this {subject}." plus whether the model charges for refusals |
| `InsufficientCredits` | never | `add_credits` | "Your Comfy workspace is out of credits." |
| `Unauthorized`, `Forbidden` | never | `check_key` | "That key wasn't accepted, or it doesn't have Router access." |
| `NotEnabled` | never | `check_key` | "This isn't enabled for your key yet." (for `/estimate`, hide the price silently) |
| `RateLimited`, `ConcurrencyLimitExceeded`, `QueueBacklogFull` | auto, after `retryAfter`, at most 3 times | `wait` | "Waiting in line." |
| `ProviderError`, `ProviderTimeout`, `QueueTimeout`, `DeadlineExceeded`, `ServiceUnavailable`, `InternalError`, `ClientDisconnected` | manual, with a new key |  | "The provider didn't finish this one. Retry it?" |
| `ModelNotFound` | never |  | "This model isn't available right now." (log it; it's a registry bug) |
| `Cancelled` | never |  | "Cancelled." |
| `RequestNotFound`, HTTP `410` | never |  | "This result expired before it was saved." |
| Anything else | manual |  | "Something went wrong. Request ID {id}." |

Messages say what happened and what to do next, never apologise, and always show the request ID when there is one.

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_ROUTER_BASE_URL` | `https://api.comfy.org` | The Worker's `/router` URL if risk 1 fails |
| `VITE_MEDIA_HOST` | `worker` | `worker` (the Worker's R2 upload) or `comfy-assets` (Comfy Cloud's asset store, which browsers can't reach; M1 findings) |
| `VITE_WORKER_URL` | empty | The Worker's origin, if deployed |
| `VITE_BASE` | `/portraius-studio/` | Vite `base` for GitHub Pages |

No secret ever goes in a `VITE_` variable: everything in them ends up public in the built site.

## Character vault

A character takes about two minutes to make: add photos, pass a short webcam consent check, review an AI-drawn turnaround sheet, save. Characters of other real people come from those people: they make their own character and send the file.

### Create from photos

1. **Add 3 to 10 photos** by drag-and-drop or camera. An overlay asks for varied angles, good light, no sunglasses, one face per photo. The browser checks each photo with face-api and rejects ones with zero or several faces, a face under 160 px tall, or heavy blur. Each photo gets a quality chip.
2. **Consent check** (required for `kind: "person"` from photos).
   1. The webcam opens and shows three random prompts, one at a time, from a pool: turn left, turn right, look up, smile, blink twice.
   2. The browser confirms a face is present for each prompt, that head yaw changes on the turn prompts (face landmarks), and that the face in the clip matches the photos (descriptor distance under the threshold).
   3. The subject types their name and accepts: "I am the person in these photos, and I consent to a character of me being created in this app."
   4. The app writes a `ConsentRecord`. The clip is kept only if the user opts in.
   5. Fail three times and the character can't be created from those photos. The message offers the "design from text" path instead.
3. **Turnaround sheet.** One Nano Banana 2.1 call with every photo as inline image data draws a 16:9 composite at 2K. Four more calls draw the single views (front, three-quarter, profile, full body) using the photos plus the composite. Each view is scored against the photos; views under the threshold are flagged with a "redraw" button. The user can redraw any single view.
4. **Describe.** Name, a short user-written description that gets inserted into prompts, tags, and an optional stock voice (P2).
5. **Save.** Compute the mean face descriptor from the photos, write to IndexedDB, and offer "Export .portraius".

Sheet prompt template (`lib/characters/sheet.ts`):

```
Create a character reference sheet of the same person shown in the attached photos.
Keep their exact facial structure, skin tone and texture, hairline, hair, eye shape, and any
marks or features. Do not beautify, slim, smooth the skin or change their age.
Layout: one 16:9 image, plain mid-grey studio background, soft even front lighting, natural
skin texture with visible pores.
Panels left to right: front head-and-shoulders, three-quarter left, left profile, full body
standing front-facing in simple neutral clothing, and a strip of four expressions (neutral,
smile, surprised, serious).
No text, labels, borders or watermarks.
```

### Design from text

For original characters that aren't a real person. The user describes a person, Nano Banana 2.1 draws four candidate faces, the user picks one, and the sheet is drawn from that pick. Saved with `origin: "designed"`, no photos and no consent record. This path also gives judges a way to try the app without uploading their own face.

### Import and export

- Export writes the zip described in the Data model section. The user chooses whether the consent clip is included.
- Import validates `format` and `version`, then shows a summary: name, origin, consent date and method.
- A `person` with `origin: "photos"` and no consent record imports as **locked**: viewable, but it can't be used in any generation.
- The consent record is an attestation, not cryptographic proof. The README says so plainly.

### Elements (P1)

Outfits, props, locations and styles, made from 1 to 6 photos. The sheet is a clean product-style set of views on a plain background. No face scoring and no consent check, but the create screen warns against logos and trademarked designs (the contest bans unlicensed IP).

### Limits per generation

Nano Banana 2 keeps about five characters and 14 objects consistent in one image, and 2.1 keeps those limits. Seedance 2.5 accepts up to 50 references. The UI caps a generation at 3 people and 4 elements, which keeps prompts readable and leaves room for frames.

## Image studio

One screen covers text-to-image and image editing with Nano Banana 2.1. Adding characters or elements is optional; when present, their sheets become reference images and their names become prompt slots.

### Controls

- Prompt, with `{slot}` names for cast members (for example `{lead} reading in a Tampa coffee shop`).
- Cast picker: 0 to 3 people and 0 to 4 elements.
- Source image (switches to edit mode): upload, or pick from the library.
- Aspect ratio, including the new ultra-wide and ultra-tall 1:4, 4:1, 1:8 and 8:1. Size: 1K, 2K or 4K.
- Count: 1 to 4 (parallel submits).
- Quality: Fast or Best, mapped to `thinkingConfig.thinkingLevel` `MINIMAL` or `HIGH`. Confirm in M1 that 2.1 accepts both.
- Camera and look presets (shared with Director), and a realism-pass toggle (P1).
- A collapsible "Prompt" panel showing the compiled prompt, editable in advanced mode.

### Request body

```json
{
  "contents": [{
    "role": "user",
    "parts": [
      { "text": "<compiled prompt>" },
      { "inlineData": { "mimeType": "image/png",  "data": "<lead: sheet composite>" } },
      { "inlineData": { "mimeType": "image/jpeg", "data": "<lead: best source photo>" } },
      { "inlineData": { "mimeType": "image/png",  "data": "<outfit element: sheet>" } }
    ]
  }],
  "generationConfig": {
    "responseModalities": ["TEXT", "IMAGE"],
    "imageConfig": { "aspectRatio": "4:5", "imageSize": "2K" },
    "thinkingConfig": { "thinkingLevel": "HIGH" }
  }
}
```

Per person, send the sheet composite plus the single best source photo (highest face-quality score). That gives strong identity while keeping every part under Google's 20 MB inline limit. In edit mode the source image goes first.

### Prompt compiler (`lib/prompts/compile.ts`)

The compiler builds the final text in this order, so every model gets the same structure:

1. **Reference legend.** "Image 1 is the reference sheet for LEAD (Marcus). Image 2 is a photo of LEAD. Image 3 is the OUTFIT."
2. **Identity lock.** "Keep LEAD's exact face, skin tone, skin texture and hair from images 1 and 2. Do not beautify or change their age."
3. **Scene.** The user's prompt with slots replaced by role names.
4. **Camera and look.** Phrases from the selected presets (lens, aperture, angle, lighting, film stock).
5. **Realism.** "Natural skin texture with visible pores, real lens imperfections."

### Results

Each output is decoded to a Blob, scored for identity (every detected face is matched to a cast member), and saved with its recipe. Actions on a result: Edit again, Animate (sends it to Video as the first frame), Use as anchor (Director), Realism pass (P1), Save as element, Copy remix link.

With an empty cast and no source image, this is plain text-to-image; with a source image and no cast, plain image editing.

## Video studio

Video uses Seedance 2.5 by default. Every clip starts as a cheap 480p draft and only renders at 1080p when the user approves it.

### Modes

- **Text to video:** prompt only.
- **Still first (default when a cast is selected):** Nano Banana 2.1 makes the opening frame with the characters in it, then Seedance animates from that `first_frame`. Identity is strongest this way because the hardest part (the face) is settled in the still. An optional `last_frame` gives a start-to-end shot.
- **From references:** character and element sheets go in as `reference_image` items and Seedance composes the opening itself. Use it when no fixed opening frame is wanted.
- **From an existing image:** any library image or upload as the first frame, with or without a cast.

Don't mix `first_frame` with `reference_image` items until M3 confirms Seedance 2.5 accepts the combination (MiniMax H3 explicitly refuses it). In first-frame modes Seedance 2.5 only accepts `ratio: "adaptive"`, so the frame's own shape decides the video's shape.

### Controls

Duration 4 to 30 s, aspect ratio (reference and text modes only), audio on or off (`generate_audio`), camera preset, seed, and model. The model dropdown lists registry video models; controls a model doesn't support are hidden (for example, H3 tops out at 15 s and has no draft mode).

MiniMax H3 is the second model in the dropdown, labelled "H3 (2K)". It runs 4 to 15 s at `768P` or `2K`, has no draft mode (so its button says "Generate" with the full price), and can't combine keyframe inputs with reference inputs in one request. Seedance 2.5 stays the default for every mode.

### Draft, then final

1. Show the estimate, then submit the draft:

   ```json
   {
     "content": [
       { "type": "text", "text": "<compiled prompt>" },
       { "type": "image_url", "role": "first_frame", "image_url": { "url": "data:image/png;base64,..." } }
     ],
     "draft": true,
     "resolution": "480p",
     "duration": 8,
     "ratio": "adaptive",
     "generate_audio": true,
     "return_last_frame": true,
     "seed": 1234
   }
   ```
2. The draft plays in the result card with its identity score (see Identity section). Save the result's `id` as the draft task ID. It stays valid for 7 days.
3. **Render final** submits only the draft reference. The final reuses the draft's prompt, inputs, duration, ratio, seed and audio setting:

   ```json
   { "content": [{ "type": "draft_task", "draft_task": { "id": "<draft task id>" } }], "resolution": "1080p" }
   ```
4. Save the final; keep or drop the draft per a Settings toggle.

### Edge cases

- **Audio refusals.** Seedance checks the generated audio separately, and those refusals can be intermittent. When `refusal_subject` is `output_audio`, offer "Retry silent", which must recreate the draft with `generate_audio: false` (a final inherits the draft's audio setting).
- **Last frame.** If a final render doesn't return `last_frame_url`, extract the last frame in the browser with ffmpeg.wasm.
- **Continue.** Every result has a Continue button that starts a new clip with this clip's last frame as `first_frame`. Director builds on the same mechanism.
- **Reference mode body.** Text plus `reference_image` items: per person the sheet composite and best photo, per element its sheet, and a concrete `ratio`.

With no cast, every mode works the same way minus the reference images.

## Recast (the Genjutsu rebuild)

Recast takes a clip the user owns, keeps its motion and camera work, and either recasts the performer with a saved character (Motion Transfer) or replaces one thing in the shot (Object Swap). The only source of a face is the vault, so Recast can't be pointed at a random photo of someone.

Comfy lists its own Genjutsu rebuild, "Openjutsu", as coming soon on the competition page. When it lands, read its workflow and reuse what helps. Recast's edge is the vault (saved, consented characters), the presets and the identity score, not the swap itself.

### Input

- Source clip: upload, record in the browser, or pick from the library.
- Trim UI (ffmpeg.wasm) that enforces the chosen engine's limits. Kling's edit input must be 3 to 10 s, 720 to 2160 px, 24 to 60 fps and under 200 MB.
- A required checkbox: "I filmed this or have the rights to use it." If faces other than the performer are detected, add a note: "Other people in the clip will still appear. Make sure they're OK with it."

### Modes and engines

| Mode | What changes | Engine (default) | Request shape |
| --- | --- | --- | --- |
| Motion Transfer | The performer, and optionally the setting | Seedance 2.5 reference-to-video | `reference_video` (the clip, as a hosted URL from `lib/media/host.ts`) + `reference_image` (sheet composite and best photo) + prompt: "Recreate the motion, timing and camera movement of the reference video exactly, with LEAD as the performer." Seedance only accepts `duration: -1` for editing tasks; confirm in M4 whether this mode counts as one. |
| Object Swap | One target (an outfit, prop, product or background) | Kling V3 Omni | `video_list: [{ video_url, refer_type: "base", keep_original_sound: "yes" }]` with a hosted URL + `image_list` with the element sheet + prompt with Kling's tokens: "Replace the jacket in <<\<video\_1>>> with the jacket in <<\<image\_1>>>. Keep everything else unchanged." |
| Style swap (P1) | The look of the whole clip | Seedance 2.5 | Same as Motion Transfer, cast optional, plus a style preset |

In M4, A/B Object Swap against `wan/wan2.7-videoedit`, `wan/happyhorse-1.0-video-edit` and `bfl/video-edit-v1` on three test clips (one outfit, one product, one background), then set the default.

### Presets

Genjutsu works mostly from presets, and Recast should too. Each preset is a recipe JSON in `presets/recast/`: mode, engine, prompt template with slots, and a thumbnail clip. Launch with 12 and invite pull requests for more. Starter set:

- Motion Transfer: Swap me in, Dance double, Same move new city, Stunt double.
- Object Swap: Outfit change, Product swap, Sneaker swap, New background.
- Style swap: 1970s film, Claymation.
- Music video (the official page names "a music-video transformation" as an inspiration): Neon performance, Concert stage. Both keep the clip's original audio.

### Result view

Original and recast play side by side with a shared scrubber; this is the money shot for the demo video. Show the identity score for the recast performer, a "Render final" button when the draft path applies, and "Export 9:16" for social posts.

## Director (the Cinema Studio rebuild)

Director turns a scene idea into a sequence of shots: set film-level controls once, plan the shots, lock an anchor still per shot, animate, chain, and export one stitched scene. It mirrors Higgsfield's flow (previews, then anchor, then motion) but keeps every shot editable on a timeline.

### Film and camera controls

Each option is a JSON entry with an id, label, the prompt phrase it adds, and optional per-model overrides, stored in `presets/camera/`. Film settings apply to every shot in the scene; camera settings apply per shot.

| Control | Options at launch | Applies to |
| --- | --- | --- |
| Genre | Drama, action, thriller, comedy, horror, documentary | Scene |
| Camera body | Digital cinema, 35mm film, 16mm film, VHS camcorder, phone | Scene |
| Look / film stock | Clean digital, warm Kodak-style, cool Fuji-style, bleach bypass, black and white | Scene |
| Era | 1970s, 1990s, present day | Scene |
| Pacing | Calm, standard, fast (sets default shot length and cut density) | Scene |
| Shot size | Extreme close-up, close-up, medium close-up, medium, wide, extreme wide | Shot |
| Angle | Eye level, low, high, overhead, Dutch | Shot |
| Lens and aperture | 24, 35, 50, 85, 135 mm, anamorphic; f/1.4 to f/11 | Shot |
| Movement | Static, slow push-in, pull-back, dolly left or right, orbit, crane up, handheld follow, whip pan | Shot |
| Lighting | Soft key, hard noon sun, golden hour, neon, practicals only, moonlight | Shot |

Example entry:

```json
{ "id": "slow-push-in", "label": "Slow push-in", "group": "movement",
  "phrase": "the camera slowly pushes in toward the subject",
  "overrides": { "kling/kling-v3-omni": "slow dolly-in, steady" } }
```

### Shot schema

```ts
export type Shot = {
  id: string;
  index: number;
  size: "ECU" | "CU" | "MCU" | "MS" | "WS" | "EWS";
  angle: "eye" | "low" | "high" | "overhead" | "dutch";
  lens: string;
  aperture?: string;
  movement: string;
  lighting?: string;
  action: string;                 // "{lead} slides the envelope across the table"
  castSlots: string[];
  durationSec: number;            // 4 to 30 on Seedance 2.5
  continuity: "cut" | "continue"; // continue = first frame is the previous shot's last frame
  anchorGenerationId?: string;
  draftJobId?: string;
  finalGenerationId?: string;
};
```

### Workflow

1. **Scene card.** Logline, cast, a location element, and the film settings.
2. **Shot list.** Rows the user adds and edits. P2 adds "Draft with AI": `anthropic/claude-sonnet-5-5` returns 3 to 6 shots as JSON matching the `Shot` schema, which the user then edits.
3. **Anchors.** For each shot, Nano Banana 2.1 draws 2 to 4 stills with the cast references and camera phrases. The user picks one as the anchor; identity scores show on each.
4. **Animate.** Each shot becomes a Seedance draft with its anchor as `first_frame`. Chaining (P2): when `continuity` is `continue`, the previous shot's last frame is used instead.
5. **Review.** Drafts sit in a timeline strip. Drag to reorder, re-roll any shot, render finals for approved ones.
6. **Export.** ffmpeg.wasm re-encodes every final to 1080p, 24 fps, AAC, then concatenates them with optional 6-frame crossfades. The MP4 goes into the library and downloads.

### Continuity rules

- Film settings and the location element are injected into every shot's prompt, word for word.
- Each cast member's wardrobe element, if set, rides along on every shot they appear in.
- A scene-level seed is the base; shot seeds are base + index, so re-rolling one shot doesn't change the others.

### One-take multi-shot (P2)

For short sequences (up to 15 s total), offer Kling V3 Omni's built-in multi-shot: `multi_shot: true`, `shot_type: "customize"`, and up to 6 `multi_prompt` entries, each with its own prompt (512 characters max) and duration. Good for a fast first pass before refining shot by shot.

## Identity match score

Every output that contains a cast member gets a 0 to 100 identity score, computed in the browser against that character's own photos. A low score on an image triggers one automatic retry. This is the number the demo leans on instead of "looks consistent."

### How it's computed

- **Library:** `@vladmandic/face-api` with the SSD MobileNet v1 detector, 68-point landmarks and the face recognition net (128-number descriptors). Runs on WebGL with a WASM fallback; weights are served from `/public/models`. Confirm the weights' license in M5 and note it in the README.
- **Reference:** at save time, one descriptor per source photo, plus their mean, stored in the character.
- **Image:** detect every face at least 80 px tall, compute descriptors, and for each cast member take the smallest distance to any of their reference descriptors. With several cast members, assign faces to people greedily by smallest distance (at most 3 people, so greedy is fine).
- **Distance to score:** linear map, distance 0.35 or less is 100 and 0.75 or more is 0. These two constants live in `lib/identity/score.ts` and get calibrated in M5 on 20 same-person and 20 different-person pairs.
- **Video:** sample one frame per second (up to 10 frames), score each, and report the median plus the worst frame, with thumbnails of frames under the threshold.

### Bands and actions

| Score | Label | Image behaviour | Video behaviour |
| --- | --- | --- | --- |
| 80 to 100 | Strong match | Nothing | Nothing |
| 60 to 79 | Check | Badge only | Badge only |
| Under 60 | Drift | One automatic retry with a new seed and the front view added to references; both results shown, best one first | "Retry draft" button (no automatic retry, to protect credits) |

Automatic retry can be switched off in Settings.

### Where scoring is skipped

Stylised presets (anime, claymation, cel shading) and profile-only shots score low by design. When a non-realistic style preset is active, show "Score not available for stylised looks" instead of a misleading number.

### Optional second opinion (P2)

For elements and stylised outputs, `vertexai/gemini-3.8-flash` gets the reference sheet and the output and returns `{ "same_subject": boolean, "confidence": number, "notes": string }`.

### Privacy

Face descriptors are biometric data. They stay in IndexedDB and leave the device only inside an exported `.portraius` file. Nothing is sent to a server for scoring.

## Finishing, voice and lip sync

Three add-ons that sit on top of results: a one-click realism pass for stills (P1), voices for characters (P2), and lip sync (P2).

### Realism pass (P1)

- **Model:** `freepik/ai-skin-enhancer-faithful`. Image as base64; defaults `skin_detail: 80`, `sharpen: 10`, `smart_grain: 4`, exposed as a small "Strength" slider.
- **Where:** a "Make it real" button on any still, and an optional automatic pass on anchor stills before they're animated (a better first frame gives a better video).
- **Output:** `data.generated[]` holds Freepik's own expiring links, so download immediately.
- **Check:** re-run the identity score after the pass, and show a before/after slider.
- **Upscaling (P2):** `fal/crystal-upscaler` or `wavespeed/seedvr2` for images, `bfl/video-upscale-v1` or `wavespeed/flashvsr` for video. Read their schemas in M1 alongside the rest.

### Voice (P2)

- **Model:** `elevenlabs/eleven_v4`, which on Router is ElevenLabs text-to-dialogue: `inputs[]` of `{ text, voice_id }`, up to 10 distinct voices in one call. A two-character exchange is a single request.
- **Voices:** stock voices only. This route has no cloning, which also keeps voice likeness out of scope. Ship a curated list of about 12 stock voice IDs in `presets/voices.json` and confirm each works through Router in M7.
- **Delivery:** the response body is raw audio bytes, so it can't be queued. Call the synchronous route with `fallback_provider=false`.
- A character can store a default `voice` so it travels with the file.

### Lip sync (P2)

Two paths, tested side by side in M7:

1. **Post-sync (default):** a finished video plus the dialogue audio go to `synclabs/sync-3` as `input: [{ type: "video", url }, { type: "audio", url }]` with `options.sync_mode: "cut_off"`. Both inputs must be public URLs, so both go through `lib/media/host.ts`. The result's `outputUrl` is Sync Labs' own link and isn't rehosted, so download it immediately.
2. **Generate speaking:** Seedance 2.5 with the dialogue as `reference_audio` (a data URI is fine for audio), the anchor as `first_frame`, and a prompt like "LEAD speaks the line in the reference audio." One call instead of two, if the mouth sync holds up.

## Presets and recipes

Every preset is a JSON file in the repo that anyone can add through a pull request, and every output can be shared as a remix link. Together they're the Most Viral loop, and an open-source story a closed platform can't tell.

### Folders

| Folder | Holds | Launch count |
| --- | --- | --- |
| `presets/recast/` | Motion Transfer, Object Swap and style swap templates | 12 |
| `presets/image/` | One-click image templates (studio headshot, 1996 yearbook photo, film still, editorial cover with invented masthead) | 10 |
| `presets/video/` | Clip templates (walk-in, product reveal, slow-motion turn, talking to camera) | 6 |
| `presets/camera/` | Film and camera controls used by Director, Image and Video | All options in the Director table |
| `presets/looks/` | Film stocks and styles | 8 |
| `presets/voices.json` | Curated stock voice IDs (P2) | About 12 |

### Preset file

```json
{
  "format": "portraius.preset",
  "version": 1,
  "id": "yearbook-1996",
  "type": "image",
  "title": "1996 yearbook photo",
  "author": "github-handle",
  "license": "CC0-1.0",
  "thumbnail": "yearbook-1996.webp",
  "recipe": { "capability": "image.generate", "model": "vertexai/gemini-nano-banana-2.1", "slots": [{ "slot": "lead", "kind": "person" }], "prompt": "..." }
}
```

Presets are validated with zod (`lib/presets/schema.ts`) and loaded at build time into a gallery on each studio screen.

### Contribution flow

- `CONTRIBUTING.md` explains: copy `presets/_template.json`, make a thumbnail, run `npm run presets:check`, open a pull request.
- `presets:check` validates the schema, caps thumbnails at 200 KB, and scans titles and prompts against a short list of brand and celebrity names.
- A GitHub Action runs the same check on every pull request.
- Thumbnails use designed characters (swapped for Marzuwq's sample character once he provides it), never other real people.

### Remix links

- "Copy remix link" on any result puts the recipe in the URL fragment (`#/remix?r=...`), so nothing is uploaded.
- Opening a remix link shows the recipe card with a slot picker per role, filled from the visitor's own vault, or a "Design a character" button if the vault is empty. Then one click to run.
- A remixed generation records `remixOf` (a hash of the source recipe) for attribution in the library.
- "Save as preset" on any recipe downloads a ready-to-PR preset file.
- Social export: 9:16 MP4 with an optional end card ("Made with Portraius Studio, open source"), on by default and one click to turn off.

## ComfyUI workflows and custom node pack

The contest asks for workflow files in the repo, so the `workflows/` folder is P0: ComfyUI graphs that reproduce the app's two core flows. The custom node pack that lets `.portraius` files work inside ComfyUI itself is P2.

### Workflows (P0, M8)

| File | What it reproduces | Nodes |
| --- | --- | --- |
| `workflows/character-sheet.json` + `.api.json` | Photos to turnaround sheet | Load Image nodes + the built-in Nano Banana 2.1 partner node |
| `workflows/still-first-video.json` + `.api.json` | Character still, then animated clip | Nano Banana 2.1 partner node, then the Seedance 2.5 partner node |
| `workflows/README.md` | How to open them in ComfyUI or Comfy Cloud, and which partner nodes they need |  |

Export both the UI format and **Workflow (API)** format. If a partner node for either model isn't in current ComfyUI, use the closest available one and say so in the README.

### Custom node pack (P2): `comfyui-portraius-characters`

Built with the V3 node schema ([migration guide](https://docs.comfy.org/custom-nodes/v3_migration.md)).

| Node | Inputs | Outputs | Notes |
| --- | --- | --- | --- |
| Load Portraius Character | `.portraius` file from `input/characters/` | `PORTRAIUS_CHARACTER`, sheet `IMAGE`, views `IMAGE` batch, photos `IMAGE` batch, name and description `STRING` | Raises an error for a photo-based person with no consent record, matching the app |
| Character Prompt | One or more `PORTRAIUS_CHARACTER`, scene `STRING`, camera preset id | Compiled prompt `STRING`, reference `IMAGE` batch | A Python port of `compile.ts`, so graph outputs match app outputs. Plugs into existing partner nodes. |
| Identity Score | `IMAGE` (or frame batch), `PORTRAIUS_CHARACTER` | Score `FLOAT`, report `STRING` | Uses `facenet-pytorch` (MIT). Scores won't match the browser's exactly; the README says so. |

### Publishing

- `pyproject.toml` with `[project]` (name, version, license, repository URL) and `[tool.comfy]` (PublisherId, DisplayName, Icon), per the [Registry spec](https://docs.comfy.org/registry/specifications.md).
- An `example_workflows/` folder so the graphs show up in ComfyUI's Template Browser.
- Publish with `comfy node publish` or the Registry's GitHub Action ([publishing guide](https://docs.comfy.org/registry/publishing.md)).

The pitch for Most Innovative: a character you make in the app is a file you can load in ComfyUI, score in ComfyUI, and share with anyone running either.

## Open weights: out of scope

Decided October 19: no open-weights profile and no Open Weights Only entry. The app uses partner models through Comfy Router, which the official rules explicitly allow; only the Open Weights Only category bans them.

## UI and UX

Six work screens in a left rail, a shared jobs tray, and a first-run path that gets someone from zero to a result in under three minutes. It should feel like a creative tool, not a dashboard. The Visual direction section sets the look.

### Screens

| Screen | Main parts | States to design |
| --- | --- | --- |
| First run | Three steps: add a key (or start the Tour), make or design a character, run a preset | No key, key invalid, key OK |
| Characters | Card grid with origin, consent and lock badges; 5-step create wizard; detail page with sheet, views, redraw buttons, export | Empty vault, locked import, consent failed |
| Image | Controls on the left, results grid in the centre, preset strip on top, collapsible prompt panel | Empty, generating, retrying for drift, refused |
| Video | Same layout plus draft/final controls; player with frame thumbnails and per-frame identity | Draft ready, rendering final, audio refused |
| Recast | Upload and trim panel, mode tabs, preset gallery, side-by-side player | Clip too long, rights not confirmed |
| Director | Scene card, shot list table, anchor row per shot, timeline strip, export button | Shot missing anchor, stitching, export done |
| Library | Masonry grid; filters for type, character, model, date and score; recipe view; remix link; bulk zip export | Storage nearly full |
| Remix | Recipe card, slot pickers, run button | Empty vault (offer "Design a character") |
| Settings | Key handling, default models, auto-retry, keep drafts, storage use, export library, delete all data |  |
| Tour | Plays pre-made outputs from `samples/` with a "pre-made sample" label on each; no key needed |  |

### Job lifecycle (every card, every screen)

Estimate shown, then **Queued** (with queue position), **Generating** (indeterminate, since Router sends no progress), **Downloading**, **Scoring**, then **Done** or **Failed** (plain-language message, request ID, Retry). The jobs tray lists every in-flight job, survives navigation and page reloads, and links each job to its result.

### Key handling

- The visitor pastes a key in Settings. It's kept in `sessionStorage` by default (cleared when the tab closes); "Remember on this device" is opt-in and stores it in IndexedDB.
- Local development is identical: `npm run dev`, then paste a key. There's no `.env` key path because there's no server to hold one. Only `scripts/smoke.ts` reads `COMFY_API_KEY`, from the shell.
- Settings shows exactly where the key is sent (`api.comfy.org`, or the Worker if M1 adds one) and has a "Forget key" button.

### Details that matter

- Keyboard: `G` generate, `D` toggle draft/final, `R` retry, `E` export.
- Alt text on every output comes from its prompt. Respect reduced-motion settings in players and transitions.
- Responsive down to 390 px wide for every screen except Director, which shows a "best on desktop" notice on small screens.
- Cost: show the estimate on the Generate button ("Generate · $0.24") and a running "spent this session" figure from `X-Comfy-Credits-Used` where Router returns it.

## Visual direction

The app is a portrait studio. Work sits on a neutral grey seamless, panels are proof paper, and picks are marked the way photographers mark contact sheets: with a grease-pencil circle. That circle is the one bold element; everything around it stays quiet.

### Why grey

Skin tones are the product. A neutral mid-grey surround (the same backdrop the turnaround sheets use) is how photographers judge colour without a cast, so every image and video sits on Studio grey, never on white or black.

### Colour tokens

Defined once in `src/styles/tokens.css`; no raw hex values anywhere else. The theme follows the system setting, with a toggle in Settings.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--seamless` | `#64676B` | `#4E5155` | Behind every image and video; large labels only |
| `--proof` | `#EEF0F1` | `#26292C` | Panels, rail, dialogs |
| `--ink` | `#26292C` | `#E6E8EA` | Text, icons, primary button fill |
| `--rule` | `#C9CDD1` | `#3A3E42` | 1 px dividers and print outlines |
| `--grease` | `#D2352B` | `#F0574B` | Selection marks only, never text |
| `--match` | `#4F6B34` | `#9BBF7A` | Identity 80 to 100 |
| `--check` | `#8A5E0C` | `#E0B455` | Identity 60 to 79 |
| `--drift` | `#A3313A` | `#F08A90` | Identity under 60, and errors |

Contrast targets (verify in M8 with the Lighthouse run): ink on proof about 12:1; proof text on seamless at least 4.5:1; the three status colours on proof at least 4.5:1 in both themes.

### Type

- **Display:** Big Shoulders Display (OFL), weights 600 and 800. A condensed face with a film-slate feel, used for screen titles, scene and shot numbers, identity scores, and Recast's "Original" and "Recast" labels.
- **Interface and body:** Atkinson Hyperlegible Next (OFL), weights 400 and 600. Chosen for legibility in dense control panels and for consent text that people must actually read.
- Self-host both as WOFF2 in `public/fonts/` (no Google Fonts CDN, per the CSP).
- Scale in px: 13 for controls, 15 for body, 18 for panel titles, 28 for screen titles (display), 44 for slate numbers and scores (display).
- Prose blocks (the consent statement, help text) stay under 70 characters a line.
- Sentence case everywhere. No all-caps labels and no letter-spaced eyebrows.

### Layout

```
+------+--------------------------+-------------------------------------+
| rail | call sheet (controls)    | set (Studio grey)                   |
|      | prompt                   |  +--------+  +--------+  +--------+ |
| Cast | cast picker              |  | take 1 |  | take 2 |  | take 3 | |
| Img  | camera and look          |  +--------+  +--------+  +--------+ |
| Vid  | ratio, size, count       |      picked take: grease circle     |
| Rec  |                          |                                     |
| Dir  | [ Generate ($0.24) ]     |                                     |
| Lib  |                          |                                     |
+------+--------------------------+-------------------------------------+
| film strip: the jobs tray, one thumbnail per queued or finished job   |
+-----------------------------------------------------------------------+
```

- Text is left-aligned; media is centred in the set.
- Outputs are "takes" shown at their true aspect ratio, as prints: 2 px radius, 1 px `--rule` outline. No card shadows, no gradients.
- Two radii, chosen by role: 2 px for media, 6 px for controls and buttons.
- Spacing on an 8 px grid.
- Below 768 px wide, the rail becomes a bottom bar and the call sheet slides up over the set.

### Signature: grease-pencil marks

- Picking a take, an anchor, a candidate face or a sheet view draws a hand-drawn circle around it: an SVG path with a slight wobble, 3 px stroke, `--grease`.
- A rejected take gets a single diagonal grease stroke.
- Nothing else in the app uses `--grease`.

### Motion

- One ambient moment: when a take lands, it "develops", fading up from Studio grey over 600 ms.
- Grease marks draw on over 250 ms when the user picks.
- Everything else changes instantly. With `prefers-reduced-motion`, takes appear without the fade and marks appear without drawing.

### Recast split view

Both clips share one frame. A vertical wipe line the user drags shows Original on the left and Recast on the right, with the labels in Big Shoulders at 28 px on the seamless above each side. One scrubber below drives both clips. Draft or final is a small text label, not a colour.

### Copy rules

- Name things by what people do: "Make a character", "Render final", "Export file". A button and its confirmation use the same verb ("Render final", then "Final rendered").
- Errors say what happened and what to do, with no apologies (messages in Contracts).
- Empty states invite one action. The empty vault says "Make your first character" and shows the two ways to do it.
- Plain words over film jargon, except where the film word is clearer: draft, final, shot, scene, take.
- No arrows tacked onto buttons, no emoji.

### Don'ts

No glassmorphism, no purple-to-blue gradients, no grids of shadowed cards, no monospace labels, and no shadcn/ui component left in its default styling: every component takes the tokens above.

## Security, privacy and contest compliance

The contest requires lawful, SFW entries with no unlicensed IP or likenesses, so those rules are enforced by the product itself, not left to the README.

| Risk | Control | Where it lives |
| --- | --- | --- |
| A real person's likeness used without consent | Webcam consent check for every photo-based person; imports without consent are locked; Recast only takes faces from the vault | `lib/characters/consent.ts`, import validator, Recast cast picker |
| Minors | The consent statement includes "I am 18 or older" | Consent step |
| Copyrighted or branded material | Rights checkbox on every uploaded clip and audio file; trademark warning on elements; brand-name scan on presets; samples use only Marzuwq's own footage and generated audio | Recast input, Elements, `presets:check` |
| NSFW output | Provider safety filters stay at their defaults; the app never sends Gemini `safetySettings` that lower them; refusals are shown plainly with no retry tricks | Adapters, error mapper |
| API key exposure | The key stays in the visitor's browser and is sent only to `api.comfy.org` (or our Worker); no analytics or third-party scripts; a CSP meta tag limits `connect-src` to Comfy and asset hosts; ffmpeg and face-api assets are self-hosted, not loaded from a CDN | Settings, `index.html` |
| Unknown or malformed model calls | Registry allowlist and zod validation in the Router client; body size checked against the 100 MiB cap before sending | `lib/router/client.ts` |
| Worker abuse (only if M1 adds the Worker) | Forwards only to `api.comfy.org`; model ID allowlist; host allowlist for uploads and downloads; per-IP rate limit of 30 requests per minute; stores no keys; R2 uploads deleted after 1 hour | `proxy/` |
| Biometric data exposure | Face descriptors and consent clips stay in IndexedDB; export of the consent clip is opt-in; "Delete all data" wipes IndexedDB and caches | Store, Settings |
| Location leaks in photos | EXIF stripped during browser image prep | `lib/media/image-prep.ts` |
| Results served by Higgsfield | No `model_provider`; queued submits have no fallback; `fallback_provider=false` on sync calls; `higgsfield/*` IDs blocked | `lib/router/client.ts` |
| Surprise charges | Estimate before every run; policy refusals show whether the model charges for them | Generate button, error mapper |
| Undisclosed AI media | Exported files carry an "AI-generated with Portraius Studio" metadata comment (image XMP, MP4 `comment` tag) (P1) | Export |

The README gets a short "Responsible use" section: the consent record is an attestation rather than proof, the app is not for impersonation, and how to report misuse.

## Testing and acceptance criteria

Every P0 feature has a pass/fail check below, backed by four test layers. Nothing deploys to GitHub Pages unless `npm run smoke` passes against real Router calls.

### Test layers

1. **Unit (Vitest):** each adapter's `buildBody` and `extractAssets` against real responses recorded in M1 (`test/fixtures/`, with asset bytes stubbed); prompt compiler snapshots; character zip round-trip; recipe encode and decode; error mapper; distance-to-score mapping.
2. **Contract:** generated schema types compile; every registry model ID resolves in the Router catalog (`GET /v2/models/{id}`); no registry ID starts with `higgsfield/`.
3. **End-to-end (Playwright, Router mocked with MSW):** character wizard, image generate, video draft then final, Recast, library intact after reload (job handle rebuilt), Tour mode with no key.
4. **Smoke (`npm run smoke`, real key, costs cents):** one Nano Banana 2.1 image, one 4 s Seedance 480p draft, one estimate, and one queued handle rebuilt from a stored ID. Prints request IDs and costs.

### Acceptance criteria

| Feature | Passes when |
| --- | --- |
| Character create | 5 photos produce a sheet and 4 views in under 3 minutes; at least 4 of the 5 images score 80 or more on a designed character (re-checked on the sample character once Marzuwq provides it); export then import gives byte-identical `character.json` and files |
| Consent | A different person on the webcam fails; all three prompts are verified; a locked import can't be used in any generation |
| Image studio | With one character, at least 8 of 10 outputs score 80 or more; works with no cast; edit mode works |
| Video studio | A final renders from the draft ID with no inputs re-sent; reloading mid-job resumes and completes the job |
| Recast | On an 8 s clip, Motion Transfer keeps timing (checked side by side) with a median performer score of 70 or more; Object Swap changes only the target on all 3 test clips |
| Identity score | Calibrated constants separate 20 same-person and 20 different-person pairs with 2 or fewer errors |
| Library | Outputs still play 48 hours later (proves bytes were saved, not links) |
| GitHub Pages site | On the GitHub Pages site, a fresh browser with a judge's key gets a first image in under 3 minutes; Tour works with no key |
| Provider check | No request sends `model_provider`; any response carrying `X-Comfy-Router-Fallback-Provider` is logged as a warning |
| Cost display | Every Router call shows a figure, a range, or "price unknown" before it runs |
| Accessibility | Lighthouse accessibility score of 90 or more on each main screen |
| Job state machine | Unit tests cover every transition in the Contracts table, including all three reload-recovery cases |
| Visual direction | No hex colour in src/ outside tokens.css; both themes meet the contrast targets; reduced motion turns off the develop fade and mark drawing; only selection marks use --grease |

## Submission, README and demo video

Target submitting on the evening of October 29, not the morning of the deadline (October 30, 9:00am PT). Sign up today: the first 200 signups get free credits.

### Checklist

- [ ] Sign up on the [competition sign-up form](https://form.typeform.com/to/Ayn9Cwfj) (first 200 get free credits)
- [ ] Public GitHub repo with an MIT `LICENSE`
- [ ] `README.md` (outline below)
- [ ] `workflows/` with the two ComfyUI graphs and their README
- [ ] GitHub Pages site live, with Tour mode and visitor-key mode
- [ ] Sample character, `public/samples/` and preset thumbnails regenerated with it (Marzuwq provides the character after the build)
- [ ] Demo video, 2:00 or less (Marzuwq records it after testing)
- [ ] Posts on X, Instagram and LinkedIn linking the video and repo, tagged #OpenSourceHiggsfield
- [ ] Entry sent on the [submission form](https://form.typeform.com/to/V1dSQrkS)

### What the official page adds

- **Partner models are allowed.** Only the Open Weights Only category bans partner nodes and closed-source APIs.
- **Demo video:** judged on the work, not the editing. The best demo shows the work in action and explains how it was built.
- **Openjutsu:** Comfy lists its own Genjutsu rebuild as coming soon (see Recast).
- **Inspiration prompts:** a performance effect, a cinematic camera move, or a music-video transformation.
- **Winners** are featured on comfy.org/hub with credit.
- The page's "App requirements" section and the Q&A on combining a main prize with a bonus are collapsed and couldn't be read here. Check both before submitting. The ComfyUI Wiki recap lists: a working app with a usable interface and example outputs, app code plus workflow files plus local run instructions, a demo of 2 minutes or less, an optional link to try it, and a social post.

### GitHub Pages deploy

- Vite `base: "/portraius-studio/"` and `HashRouter`, so deep links and remix links work without server routing.
- `.github/workflows/pages.yml`: on push to `main`, run `npm ci` and `npm run build`, upload `dist/` with `actions/upload-pages-artifact`, deploy with `actions/deploy-pages`.
- If M1 adds the Worker: `proxy/README.md` with `wrangler deploy` steps, and a README line saying the Worker only forwards requests and stores nothing.

### README outline

1. One-line pitch and a 20-second GIF of a Recast side by side.
2. Try it: GitHub Pages link, Tour mode.
3. Why it's different: portable character files, consent built in, identity score, presets anyone can contribute, Director and Recast.
4. Quick start: Node 22+, `npm ci`, `npm run dev`, open the local URL, paste a Comfy API key with Router access in Settings.
5. Models used, with Router IDs and what each one does.
6. Costs: how estimates work, draft then final.
7. Architecture diagram and repo map.
8. ComfyUI workflows (and the node pack, if shipped).
9. Responsible use.
10. Contributing presets.
11. License, plus a note that model licenses are separate.

### Demo video script (draft, revisit after testing)

| Time | On screen | Voice-over or caption |
| --- | --- | --- |
| 0:00 to 0:10 | Recast side by side: Marzuwq swapped into his own clip | "Higgsfield promised to open source. So I built it." |
| 0:10 to 0:30 | Photos, webcam consent prompts, turnaround sheet, export of the `.portraius` file | "Your character is a file you own, and it can't be made without consent." |
| 0:30 to 0:45 | Same character in three image presets, identity badges on each | "Every output gets an identity score." |
| 0:45 to 1:00 | Still-first video: 480p draft with its price, then the 1080p final | "Cheap drafts first. Pay for 1080p only when you like it." |
| 1:00 to 1:15 | Recast presets: Motion Transfer and Object Swap | "Genjutsu, open source." |
| 1:15 to 1:30 | Director: three shots stitched into one scene (or the remix-link flow if Director slips) | "Cinema Studio, open source." |
| 1:30 to 1:45 | How it's built: the architecture diagram, the Router model IDs, the ComfyUI workflows | "A static app on Comfy Router. The same pipeline runs as ComfyUI workflows." |
| 1:45 to 2:00 | The innovation list on screen, then repo URL and hashtag | "Portable characters, consent, identity scoring, community presets. MIT licensed." |

The Most Innovative prize requires the video to clearly explain why the entry is innovative, and the official Q&A asks for how it was built, so both segments stay on screen long enough to read.

## Build order for Claude Code

Eight milestones from October 19 to October 29, each with a prompt to paste into Claude Code one at a time. Code freezes at noon on October 29.

| Milestone | Dates |
| --- | --- |
| M1 Foundation | Oct 19 to Oct 20 |
| M2 Character vault | Oct 20 to Oct 22 |
| M3 Image and Video | Oct 22 to Oct 23 |
| M4 Recast | Oct 23 to Oct 25 |
| M5 Identity, Library | Oct 24 to Oct 25 |
| M6 P1 features | Oct 25 to Oct 27 |
| M7 P2 stretch | Oct 27 to Oct 28 |
| M8 Submission | Oct 27 to Oct 29 (code freeze noon Oct 29) |
| Submit (target) | Oct 29 |
| Deadline | Oct 30, 9:00am PT |

M4 and M5 overlap on purpose: identity calibration can run while the Recast engines are being compared. M7 only happens if M1 to M6 finish by the evening of October 27.

### Setup (before M1)

This file is `docs/SPEC.md`. The repo root carries this same `CLAUDE.md`:

```markdown
# Portraius Studio: working rules

- docs/SPEC.md is the source of truth. Read the sections named in each milestone before coding.
  Paths the spec writes as lib/... live in src/lib/...
- The Contracts section is fixed: routes, module boundaries, job state machine, Dexie schema,
  error mapping, config. Change any of them only after asking Marzuwq.
- Static site for GitHub Pages: Vite + React + TypeScript with HashRouter. No backend.
  Only proxy/ (if M1 adds it) runs server-side.
- All generation goes through src/lib/router/client.ts. No other file imports @comfyorg/sdk.
- Model IDs live only in src/lib/registry/models.ts. Never add a higgsfield/* ID. Never send model_provider.
- Nano Banana means vertexai/gemini-nano-banana-2.1. Never vertexai/gemini-3.1-flash-image.
- Video: Seedance 2.5 is the default. MiniMax H3 is selectable, never the default.
- Queue every model that supports it. Sync only for byte-returning models, with fallback_provider=false.
- Download every asset on completion. Never persist a provider URL as the asset.
- Only src/lib/jobs/machine.ts changes a job's status.
- Never edit a Dexie version that has shipped; add version(n + 1) with upgrade().
- The Comfy API key comes only from the visitor via Settings. Never commit a key, never put one in a
  VITE_ variable, never log it, never add analytics or third-party scripts.
- Style only with the tokens in src/styles/tokens.css and follow Visual direction.
  No raw hex values, no shadcn component left in its default styling.
- When a check in "Unknowns and fallbacks" fails, apply that row's fallback and note it in
  docs/notes/. Stop only where the row says STOP AND ASK.
- Use designed characters for tests and thumbnails until Marzuwq provides the sample character.
- Before calling a task done: npm run typecheck && npm test.
  Run npm run smoke (key from the shell's COMFY_API_KEY) before any deploy.
- Small commits, one feature each. Write findings to docs/notes/ when a milestone asks.
- When a milestone says STOP AND ASK, stop and wait for Marzuwq's answer.
```

### Milestone prompts

**M1: Foundation (Oct 19 to 20)**

```
Read docs/SPEC.md: Decisions and defaults, Architecture, Model registry and Comfy Router
integration, Contracts, Unknowns and fallbacks (rows 1 to 6), Visual direction (tokens and type),
Testing.
Scaffold Vite + React + TypeScript with HashRouter, Tailwind, shadcn/ui, Dexie, Zustand,
TanStack Query, zod, Vitest and Playwright, with base from VITE_BASE. Add src/styles/tokens.css,
the self-hosted fonts, every route from Contracts as an empty screen, and the Settings screen
for the visitor's key.
Apply the SDK browser setup from Architecture (node:crypto shim, empty aliases, comfy.config).
Run the day-one spikes from localhost before building further and write
docs/notes/m1-findings.md. Apply Unknowns rows 3 to 6 yourself; rows 1 and 2 are STOP AND ASK.
Then build: src/lib/router/client.ts; src/lib/jobs (machine, runner, hooks) exactly per the
Contracts state machine; src/lib/store with the Contracts Dexie schema; the Contracts error
mapper; scripts/gen-schema-types.ts for every registry model; the Nano Banana 2.1 and
Seedance 2.5 adapters (others stubbed) with recorded fixtures (base64 stripped);
npm run smoke; and .github/workflows/pages.yml deploying the shell.
Done when: the findings are written, smoke passes, unit tests cover every state-machine
transition and both adapters, and the shell is live on GitHub Pages.
```

**M2: Character vault (Oct 20 to 22)**

```
Read docs/SPEC.md: Data model and local-first storage, Contracts, Character vault, Identity match
score (reference descriptors only), Visual direction (grease-pencil marks), Security,
Unknowns and fallbacks (row 12).
Build photo intake with face-api quality checks, the webcam consent check (three random prompts,
yaw check, face match, typed name, 18+ statement), sheet generation (composite plus four views),
single-view redraw with grease-pencil picks, describe and save, .portraius export and import with
JSZip, locked imports, and the design-from-text path.
Test with designed characters. Marzuwq tests photo-based creation with his own face himself;
the sample character comes after everything else is built.
Done when the Character create and Consent rows of the acceptance table pass.
```

**M3: Image and Video studios (Oct 22 to 23)**

```
Read docs/SPEC.md: Image studio, Video studio, UI and UX, Visual direction (layout, takes,
motion), Contracts (routes, job state machine), Unknowns and fallbacks (rows 7 to 9).
Build both screens, the prompt compiler, the film-strip jobs tray with reload recovery, the
estimate on the Generate button, draft then final, and Continue. Add the MiniMax H3 adapter as
the second selectable video model, labelled "H3 (2K)", with no draft mode. Seedance 2.5 stays
the default in every mode.
Done when the Image studio and Video studio rows pass on both video models.
```

**M4: Recast (Oct 23 to 25)**

```
Read docs/SPEC.md: Recast, Visual direction (Recast split view), Architecture (media hosting),
Unknowns and fallbacks (rows 10 and 11).
Build clip intake and trimming with ffmpeg.wasm, the rights checkbox, Motion Transfer on
Seedance 2.5, Object Swap on Kling V3 Omni (hosted clip URL via src/lib/media/host.ts), the
split-view player, and the 12 starter presets. A/B Object Swap against wan/wan2.7-videoedit,
wan/happyhorse-1.0-video-edit and bfl/video-edit-v1 on three clips, write
docs/notes/recast-ab.md, and make the best one the default.
Done when the Recast row passes.
```

**M5: Identity score and Library (Oct 24 to 25)**

```
Read docs/SPEC.md: Identity match score, Contracts (Dexie schema), UI and UX (Library),
Unknowns and fallbacks (rows 13 and 14).
Calibrate the distance-to-score constants on 20 same-person and 20 different-person pairs
(designed characters, or photos Marzuwq provides with consent). Add automatic retry for images,
frame sampling for video, score badges in the identity colours, the Library screen with filters
and zip export, and navigator.storage.persist().
Done when the Identity score and Library rows pass.
```

**M6: P1 features (Oct 25 to 27)**

```
Read docs/SPEC.md: Director, Presets and recipes, Finishing (realism pass), Character vault
(Elements), Security (metadata row), Unknowns and fallbacks (row 15).
Build Director without chaining: scene card, shot list, anchors with grease-pencil picks, one
Seedance draft per shot, finals, and the stitched export. Then presets as JSON with
presets:check and its GitHub Action, remix links, Elements, the realism pass with a
before/after slider, and the AI-generated metadata comment on exports.
Done when a 3-shot scene exports as one MP4 and a remix link round-trips in a fresh browser.
```

**M7: P2, only if M1 to M6 are done by the evening of Oct 27**

```
Read docs/SPEC.md: Director (chaining, one-take multi-shot, agent), Finishing (voice, lip sync),
ComfyUI workflows and custom node pack, Unknowns and fallbacks (rows 16 and 17).
Pick in this order and stop when time runs out: Director chaining and Kling one-take
multi-shot, voice with lip sync (A/B the two paths), the Director agent, then the node pack.
```

**M8: Submission (Oct 27 to 29)**

```
Read docs/SPEC.md: Submission, README and demo video; ComfyUI workflows (workflows part);
Visual direction (contrast targets); Testing.
Export the two ComfyUI workflows, write the README to the outline, finish Tour mode (ship it
with designed-character samples for now), deploy the final build to GitHub Pages, and run
Lighthouse, the contrast check in both themes, and the final smoke test. Code freeze at noon
Oct 29.
Then STOP AND ASK Marzuwq for the sample character. When he provides it, regenerate
public/samples/ and the preset thumbnails with it and redeploy. Marzuwq records the demo
video himself after testing.
```

## References

**Contest**

- [Open Source Higgsfield competition page (official rules)](https://comfy.org/open-source-higgsfield/)
- [Higgsfield promised to open source their entire platform (Comfy blog)](https://blog.comfy.org/p/higgsfield-promised-to-open-source)
- [Open Source Higgsfield challenge recap (ComfyUI Wiki)](https://comfyui-wiki.com/en/news/2026-10-15-open-source-higgsfield)

**Comfy example apps**

- [comfy-cinematic-studio](https://github.com/Comfy-Org/comfy-cinematic-studio) and its [generate route](https://github.com/Comfy-Org/comfy-cinematic-studio/blob/main/app/api/generate/route.ts)
- [comfy-reshoot](https://github.com/Comfy-Org/comfy-reshoot) and its [Comfy client](https://github.com/Comfy-Org/comfy-reshoot/blob/main/lib/comfy.ts)

**Comfy Router docs**

- [Queue Comfy Router requests](https://docs.comfy.org/development/comfy-router/queue.md)
- [Capabilities and limits](https://docs.comfy.org/development/comfy-router/limitations.md)
- [Serving providers](https://docs.comfy.org/development/comfy-router/providers.md)
- [API reference](https://docs.comfy.org/development/comfy-router/reference.md)
- [Model schemas and results](https://docs.comfy.org/development/comfy-router/schemas)
- [Seedance 2.5 model page](https://docs.comfy.org/development/comfy-router/models/byteplus/dreamina-seedance-2-5-260628/code.md)
- Schemas: [Nano Banana 2.1](https://docs.comfy.org/router-schemas/vertexai/gemini-nano-banana-2.1.json), [Seedance 2.5](https://docs.comfy.org/router-schemas/byteplus/dreamina-seedance-2-5-260628.json), [Kling V3 Omni](https://docs.comfy.org/router-schemas/kling/kling-v3-omni.json), [MiniMax H3](https://docs.comfy.org/router-schemas/minimax/minimax-h3.json), [Sync-3](https://docs.comfy.org/router-schemas/synclabs/sync-3.json), [Freepik skin enhancer](https://docs.comfy.org/router-schemas/freepik/ai-skin-enhancer-faithful.json), [ElevenLabs v4](https://docs.comfy.org/router-schemas/elevenlabs/eleven_v4.json)
- [Docs index](https://docs.comfy.org/llms.txt)

**Models and Higgsfield features**

- [Nano Banana 2.1: what changed (Artlist)](https://artlist.io/blog/nano-banana-2-1-what-changed/)
- [Nano Banana 2.1 GA and the October 29 shutdown of the old model (ToolNavs)](https://toolnavs.com/de/article/2356-nano-banana-21-goes-ga-steadier-characters-old-model-ends-october-29)
- [Image-to-video leaderboard (Arena)](https://arena.ai/leaderboard/video/image-to-video)
- [Best video generation models, October 2026 (Pinggy)](https://pinggy.io/blog/best_video_generation_ai_models/)
- [Higgsfield Genjutsu](https://higgsfield.ai/blog/higgsfield-genjutsu)
- [Higgsfield Cinema Studio 4.0](https://higgsfield.ai/blog/cinema-studio-4-0)
