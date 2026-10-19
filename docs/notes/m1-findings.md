# M1 findings: day-one checks

Run on October 19 from `localhost:5173` in Chrome 155 with Marzuwq's key: the Settings check panel
at 15:53 UTC (raw results in `.checks/m1-browser.json`, gitignored), then a follow-up Seedance probe
in the same browser at 16:00 UTC to pin down the failed download.

The Node checks (`scripts/m1-checks.ts`) haven't run yet: the shell's `COMFY_API_KEY` is a 14-character
placeholder, and Router answers it with `401 unauthorized`, the same as no key at all.

## Unknowns rows 1 to 6

| # | Result | Evidence | What we did |
| --- | --- | --- | --- |
| 1 | **Holds.** The browser calls `api.comfy.org` directly. | Catalog list, queued submit, status polls and result reads all worked. Preflight allows `localhost`, `authorization` and every method. | Nothing. No `/router/*` Worker route. |
| 2 | **Fails in the browser.** | `cloud.comfy.org/api/v2/assets` answers the CORS preflight with `401` and no CORS headers, so the upload dies as `TypeError: Failed to fetch` before it's sent. Whether Cloud accepts a Router key and returns a URL providers can fetch is still untested (needs a working shell key). | STOP AND ASK (see Open). |
| 3 | **Partly fails.** | Freepik: `ai-statics.magnific.com` downloads fine (38.6 MB, served as `application/octet-stream`). Seedance: video and last frame are rehosted at `storage.googleapis.com/partner-nodes-assets/...` (V2 signed URLs). A `no-cors` fetch comes back opaque, so the host is reachable, but it sends no CORS headers. Nano Banana returns inline base64 and needs no download. Sync Labs untested (P2, M7). | `hosts.ts`: Magnific goes in `ASSET_HOSTS`; the Seedance bucket goes in `WORKER_FETCH_PREFIXES`, which `download.ts` sends through the Worker's `/fetch`. Downloads now read the type from the bytes when a host sends `application/octet-stream`. |
| 4 | **Holds.** | `Access-Control-Expose-Headers` lists `X-Comfy-Request-Id`, `X-Comfy-Error-Type`, `Retry-After`, `X-Comfy-Credits-Used`, `X-Comfy-Refusal-Subject` and the concurrency and estimate headers. Read in the browser: request ID on 200 and 404, error type `request_not_found`. | Nothing for request IDs. But Router didn't send `X-Comfy-Credits-Used` on any queued submit or result read (Nano Banana, Seedance, Freepik), so "Spent this session" now stays hidden until Router reports a figure. |
| 5 | **Holds.** | `@comfyorg/sdk` 0.5.0 lists models, submits, polls and collects in the browser with the `node:crypto` shim. | Nothing. |
| 6 | **Fails.** | `POST /v2/models/vertexai/gemini-nano-banana-2.1/estimate` answers `403 not_enabled`. The submit response has no estimate either: its body is `request_id`, `status`, `queue_position`, `status_url`, `response_url` and `cancel_url`, and it carries no `X-Comfy-Estimate-*` headers. | Fallback: "price unknown". `client.estimate()` already returns `enabled: false` on `not_enabled`, so the Generate button shows no figure. Keep calling `/estimate` in case it turns on during the contest. |

## Other things learned

- **Nano Banana 2.1** accepts `thinkingConfig.thinkingLevel: "MINIMAL"` (half of row 7; `HIGH` is in the Node checks). At 1K 1:1 it took 17 s and returned one PNG as `inlineData` (1.6 MB).
- **Seedance 2.5** 4 s 480p draft: about 86 s in `IN_PROGRESS` with no queue position. Result keys: `content`, `created_at`, `draft`, `duration`, `execution_expires_after`, `framespersecond`, `generate_audio`, `id`, `model`, `output_format`, `priority`, `ratio`, `resolution`, `seed`, `service_tier`, `status`, `updated_at`, `usage`. `return_last_frame: true` on a draft gives `last_frame_url`.
- **Freepik skin enhancer:** about 87 s. Its output is far larger than its input (1.6 MB PNG in, 38.6 MB out), served from Magnific's `magnific-image-upscale-fast` path. For M6, check the output size before saving it and consider re-encoding.
- **Status polls** never returned `Retry-After`; the 2 s default cadence was fine.

## Open

1. **Row 2 (STOP AND ASK):** how video inputs get a public URL. The spec's fallback is the Worker's `/upload` on R2.
2. **Worker `/fetch`** for `storage.googleapis.com/partner-nodes-assets/` (row 3) is needed whatever row 2 decides. Until it's deployed, Seedance downloads fail with a "needs the download proxy" message.
3. **Shell key:** replace the placeholder, then run `scripts/m1-checks.ts` for row 7 (`HIGH`), row 9 (`last_frame_url` on a final) and the recorded fixtures, and so `npm run smoke` can run.
