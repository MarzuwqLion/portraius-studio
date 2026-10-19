# M1 findings: day-one checks

Run on October 19 from `localhost:5173` in Chrome 155 with Marzuwq's key: the Settings check panel
at 15:53 UTC (raw results in `.checks/m1-browser.json`, gitignored), then a follow-up Seedance probe
in the same browser at 16:00 UTC to pin down the failed download.

The Node checks (`scripts/m1-checks.ts`, raw results in `.checks/m1-node.json`) ran at 18:25 UTC, once the
key was saved at User scope. The terminal that launched Claude Code had carried a 14-character placeholder.

## Unknowns rows 1 to 6

| # | Result | Evidence | What we did |
| --- | --- | --- | --- |
| 1 | **Holds.** The browser calls `api.comfy.org` directly. | Catalog list, queued submit, status polls and result reads all worked. Preflight allows `localhost`, `authorization` and every method. | Nothing. No `/router/*` Worker route. |
| 2 | **Fails in the browser.** | `cloud.comfy.org/api/v2/assets` answers the CORS preflight with `401` and no CORS headers, so the upload dies as `TypeError: Failed to fetch` before it's sent. Whether Cloud accepts a Router key wasn't tested; it no longer matters for the app. | Asked Marzuwq, who chose the spec's fallback: the Worker's `/upload` on R2 (`proxy/`). `client.uploadAsset` and `deleteAsset` use it when `VITE_MEDIA_HOST=worker`. Verified at 17:37 UTC: a 2 MB clip went up, BytePlus fetched it, a Seedance `reference_video` draft rendered (request `ca4db4ff-75fa-4f8d-91ef-d7904e9d3dc7`), and the upload was deleted. |
| 3 | **Partly fails.** | Freepik: `ai-statics.magnific.com` downloads fine (38.6 MB, served as `application/octet-stream`). Seedance: video and last frame are rehosted at `storage.googleapis.com/partner-nodes-assets/...` (V2 signed URLs). A `no-cors` fetch comes back opaque, so the host is reachable, but it sends no CORS headers. Nano Banana returns inline base64 and needs no download. Sync Labs untested (P2, M7). | `hosts.ts`: Magnific goes in `ASSET_HOSTS`; the Seedance bucket goes in `WORKER_FETCH_PREFIXES`, which `download.ts` sends through the Worker's `/fetch`. Downloads now read the type from the bytes when a host sends `application/octet-stream`. Verified at 17:36 UTC: the Seedance video (2.0 MB, `video/mp4`) and last frame (`image/jpeg`) came through `/fetch`, and the Freepik result saved as `image/png`. |
| 4 | **Holds.** | `Access-Control-Expose-Headers` lists `X-Comfy-Request-Id`, `X-Comfy-Error-Type`, `Retry-After`, `X-Comfy-Credits-Used`, `X-Comfy-Refusal-Subject` and the concurrency and estimate headers. Read in the browser: request ID on 200 and 404, error type `request_not_found`. | Nothing for request IDs. But Router didn't send `X-Comfy-Credits-Used` on any queued submit or result read (Nano Banana, Seedance, Freepik), so "Spent this session" now stays hidden until Router reports a figure. |
| 5 | **Holds.** | `@comfyorg/sdk` 0.5.0 lists models, submits, polls and collects in the browser with the `node:crypto` shim. | Nothing. |
| 6 | **Fails.** | `POST /v2/models/vertexai/gemini-nano-banana-2.1/estimate` answers `403 not_enabled`. The submit response has no estimate either: its body is `request_id`, `status`, `queue_position`, `status_url`, `response_url` and `cancel_url`, and it carries no `X-Comfy-Estimate-*` headers. | Fallback: "price unknown". `client.estimate()` already returns `enabled: false` on `not_enabled`, so the Generate button shows no figure. Keep calling `/estimate` in case it turns on during the contest. |

## Other things learned

- **Nano Banana 2.1** accepts `thinkingConfig.thinkingLevel` `MINIMAL` (13 s) and `HIGH` (16 s) at 1K, so
  row 7 holds: Fast is `MINIMAL`, Best is `HIGH` (fixture `nano-banana-2.1.high.result.json`).
  Even at `MINIMAL`, the result has two image parts: a draft marked `thought: true`, then the real
  image with a `thoughtSignature`. The first day-one run saved the draft by mistake. The adapter skips
  thought parts (fixture `test/fixtures/nano-banana-2.1.result.json`).
- **Seedance 2.5** 4 s 480p draft: about 86 s in `IN_PROGRESS` with no queue position. Result keys: `content`, `created_at`, `draft`, `duration`, `execution_expires_after`, `framespersecond`, `generate_audio`, `id`, `model`, `output_format`, `priority`, `ratio`, `resolution`, `seed`, `service_tier`, `status`, `updated_at`, `usage`. `return_last_frame: true` on a draft gives `last_frame_url`.
- **Freepik skin enhancer:** about 87 s. Its output is far larger than its input (1.6 MB PNG in, 38.6 MB out), served from Magnific's `magnific-image-upscale-fast` path. For M6, check the output size before saving it and consider re-encoding.
- **Status polls** never returned `Retry-After`; the 2 s default cadence was fine.
- **Router runs this account's queued requests one at a time.** Two Nano Banana images submitted
  together came back `queue_position` 0 and 1, and the second only started once the first finished
  (15 s, then 15 s more). In smoke, an image submitted beside a Seedance draft sat `IN_QUEUE` for 90 s
  until the draft was done. No `X-Concurrency-*` headers came back on submits or status reads. For
  M3: Count 1 to 4 runs one image after another, so job cards must show the queue position, and the
  limit may differ for a judge's key.
- **Row 9 fails:** a 1080p final rendered from a draft (request `163de3a8-8b48-47be-9412-acc87a6f1f45`)
  returned no `last_frame_url`, although its draft had one. M3 applies the fallback (extract the last
  frame with ffmpeg.wasm); first try sending `return_last_frame: true` with the `draft_task`, which the
  schema doesn't list among the fields a final inherits. The final waited 114 s in the queue at
  position 1, then took 35 s.
- **Seedance `reference_video` needs `duration: -1` and `ratio: "adaptive"`** (row 10, ahead of M4).
  Seedance seems to read some prompts as an edit of the reference ("video editing tasks support only
  -1", per the schema), and an edit refuses a fixed ratio too. Five tries, all with Worker-hosted clips
  that BytePlus fetched fine (`wrangler tail`):

  | Clip | Prompt ends | Duration | Ratio | Result |
  | --- | --- | --- | --- | --- |
  | teapot | "make it a bright sunny morning." | 4 | 16:9 | `invalid_input`, empty detail |
  | teapot | "make it a bright sunny morning." | -1 | 16:9 | rendered |
  | paper boat | "make it a sunny day." | -1 | 16:9 | `invalid_input`, twice |
  | paper boat | "make it a bright sunny morning." | -1 | 16:9 | rendered |
  | paper boat | "make it a sunny day." | -1 | adaptive | rendered |

  The adapter now sends both whenever a reference video is attached. Router passes no detail for these
  refusals, so the app can only say "This model didn't accept: one of the inputs."
- **Who fetches an upload link:** a Hive moderation scanner (`HiveAI/1.0`) first, then BytePlus's
  ffmpeg (`Lavf`) with range requests, then a BytePlus "mirror-back-to-source" copy. That's about 7
  Worker requests per job, all served 200 or 206 within 4 seconds of the submit.

## The Worker

`proxy/` has `/upload`, `/m/:key` and `/fetch`. It has no `/router/*` route, because row 1 holds. Its
`/fetch` allowlist is the app's own `WORKER_FETCH_PREFIXES`, imported at build time, so the two can't
drift apart. Upload links are served for 24 hours. The app deletes each upload when its job ends, and
the bucket's lifecycle rule removes anything older than a day (R2 counts in whole days). The Security
table's "deleted after 1 hour" is a target for the app's own cleanup, not something R2 enforces.

## Open

1. **Worker deployed** on October 19 at `https://portraius-proxy.marzuwq-muhammad.workers.dev`, with the
   `portraius-media` bucket and its 1-day lifecycle rule. Its URL is in the committed `.env`, which dev,
   the Pages build and scripts all read.
2. **Rate limit on `/m/`:** the per-IP limit of 30 a minute applies to providers too, and every visitor's
   jobs are fetched from the same BytePlus and Hive IPs. At about 4 provider requests per job, roughly
   7 jobs a minute across all visitors would start getting 429s. That's fine for the contest, but watch
   for it.
3. **`VITE_MEDIA_HOST` default:** Contracts had `comfy-assets`, which can't work from a browser.
   Marzuwq approved making `worker` the default (October 19); the spec's Configuration table is updated.
4. **Credits:** no route has reported `X-Comfy-Credits-Used` yet, so smoke prints "not reported".

## M1 done

- Findings: this file. Rows 3 to 6 applied; row 2 decided by Marzuwq (Worker on R2); rows 7 and 9
  answered early.
- `npm run smoke` passed at 18:28 UTC: catalog (9 models), estimate (price unknown), a Nano Banana
  image (request `d140d4ce-05a8-44f0-976a-d8d4d06ed2c0`) and a Seedance draft (request
  `7f5802f5-b743-4f2a-a1a5-9f7e8d77d187`) through the app's runner, Seedance downloaded through the
  Worker, and a handle rebuilt from a stored request ID.
- Unit tests cover every state-machine transition, the three reload-recovery cases, both adapters
  against recorded results, the runner, the error mapper, downloads and the Worker.
- The shell is live at https://marzuwqlion.github.io/portraius-studio/ (Pages workflow run
  39303019858: tests, build and deploy all passed).
