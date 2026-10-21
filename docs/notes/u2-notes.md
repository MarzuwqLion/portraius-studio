# U2 notes: the judges' path

Decisions 6 to 12 (October 21), one commit each, plus the preset thumbnails.

## What changed

| Decision | Change |
| --- | --- |
| 6, cast before prompt | Cast sits above Prompt on Image and Video (Recast already had Performer above Direction). The prompt is a new editor (`components/studio/PromptEditor.tsx`): typing @ opens the vault, a pick shows as a chip with the face, and someone not cast yet joins the cast. Braces typed or pasted turn into chips. The stored scene still holds `{lead}`, so recipes, presets and the compiler are untouched; Cast rows read "Walt Harmon as lead", and Library and Remix show a stored prompt's slots as "@lead". Director's shot actions use the same editor. |
| 7, score wording | "Likeness 94 Strong", Review and Drifted at the same 80 and 60, whole numbers, "Lowest frame 92" in the same chip, and an ⓘ popover saying what the number measures. A drifted video or recast gets Re-roll: the same request with a new seed (a clip from a still keeps the still). |
| 8, labels | Image, then animate; Use references (with a line on what references set); Animate an image; Continue from last frame; Add a line; Import .portraius; Motion transfer and Object swap; 768p (the request still says 768P). New background has its own Setting group. The ComfyUI workflow note says "Image, then animate" too; its file names stay. |
| 9, routing note | "People in the shot render on MiniMax H3." always sits under the Video model picker, and the H3 option is named "MiniMax H3" (it was "H3 (2K)", which read wrong at the 768p default). |
| 11, first run | The right half plays the Recast side-by-side from `public/samples/`; two buttons of equal weight, "Take the tour (no key)" and "Add your key"; the three steps under them. Under reduced motion the clips hold on a frame with both performers. |
| 11, Tour | A sticky chapter list, and every chapter ends with "Try this with Walt": Walt goes into the vault if he isn't there, then the studio opens with him cast and the matching preset picked (Recast with the sample clip loaded, Director with a new three-shot scene). |
| 12, Recast stage | With no clip the set is a drop zone, the sample's original and recast looping behind "Drop a clip, or try the sample". |
| 10, preset tiles | Image, Video and Recast presets are tiles with a thumbnail; video and Recast loops play on hover and focus (not under reduced motion). The first six show, then "Show all 10". Picking a picked tile again clears it. |

## Two calls made without asking

- **Launch state, not new routes.** "Try this with Walt" hands the studio its preset and cast through
  React Router's navigation state (`lib/studio/launch.ts`), so the routes in Contracts don't change.
  A reload drops the preselection; the cast and preset are one click away.
- **No key, no failed job.** With a preset and a cast but no key, the Generate footer says "Add your
  Comfy API key to run it" and links to Settings, instead of letting the job fail with `check_key`.

## Done check

A fresh browser goes first run, Take the tour (no key), Try this with Walt, and lands on Image with
Walt's chip in the prompt, "Walt Harmon as lead" in Cast and the Film still preset picked, without a
brace typed. `npm run shots` shows it as `walt/*/tour-try-image.png`, with the Recast handoff as
`tour-try-recast.png` and the Director one as `director-scene.png`.

## Preset thumbnails

`npm run thumbnails` makes them through the app's own studios in a headless browser, with Walt
Harmon, at the cheapest settings, and shrinks each to fit `presets:check` (a 480 px WebP still, or a
3 s, 360 px muted H.264 loop). It reads `COMFY_API_KEY` from the shell, hands it only to the page's
Router client, and skips presets that already have a thumbnail. `presets:check` now also checks the
file type: a still for an image preset, a still or an `.mp4` loop for video and Recast.

Estimated before running, at Comfy's published rates (u1-notes.md): 10 image stills at about $0.05,
10 Recast stills at about $0.05, and 6 video loops at about $0.59 (a 2K still and a 4 s H3 768p clip,
or a 4 s Seedance 480p draft), about $4.55 in all. Swap me in and Dance double reuse the Tour's
concert recast and cost nothing.

| Preset | File | How it was made |
| --- | --- | --- |
| image/studio-headshot | .webp, 17 KB | Nano Banana 2.1 1K Fast, request 48571dae-ceb8-4f37-8262-034603bbe8c8, likeness 100 |
| image/editorial-cover, film-still, golden-hour-field | .webp | Nano Banana 2.1 1K Fast (first run; request IDs not kept) |
| image/instant-photo-1970s | .webp, 33 KB | Nano Banana 2.1 1K Fast, request 5a4627ef-0008-4040-98d5-68681bcba7b7, likeness 100 |
| image/movie-poster | .webp, 37 KB | Nano Banana 2.1 1K Fast, request a78da94b-cd37-4d41-a3b4-8f89ddf66aab, likeness 0 |
| image/noir-office | .webp, 26 KB | Nano Banana 2.1 1K Fast, request 56ae9191-450d-4a9d-be85-14a2466a466b, likeness 87 |
| image/park-bench-duo | .webp, 36 KB | Nano Banana 2.1 1K Fast, request 22e68494-cbe9-488b-b244-70ae255945e5, likeness 39 |
| image/profile-photo | .webp, 24 KB | Nano Banana 2.1 1K Fast, request 31c69162-f0a4-44bd-831a-a62c2c6f9a29, likeness 96 |
| image/yearbook-1996 | .webp, 28 KB | Nano Banana 2.1 1K Fast, request 19364b30-d10a-499b-8f9a-590558d0125a, likeness 100 |
| video/cliff-reveal | .mp4, 32 KB | 2K still, then MiniMax H3 768p 4 s, request d2203c24-1f6d-48c1-bed8-c28ea2e85108, face too small to score |
| video/night-walk | .mp4, 38 KB | 2K still, then MiniMax H3 768p 4 s, request bbb1113f-582c-4838-9b12-d2406e4e9db4, likeness 96 |
| video/product-reveal | .mp4, 16 KB | Seedance 2.5 480p draft 4 s (no people), request 21ba3355-90d4-49ee-b112-701a5ddfab92 |
| video/slow-motion-turn | .mp4, 23 KB | 2K still, then MiniMax H3 768p 4 s, request 3ed65d92-d0a2-4076-81fe-a4c95f2c7687, likeness 94 |
| video/talking-to-camera | .mp4, 24 KB | 2K still, then MiniMax H3 768p 4 s, request 8d2bb0ec-6c1e-4055-9353-b2e6a20e56e4, likeness 89 |
| video/walk-in | .mp4, 22 KB | 2K still, then MiniMax H3 768p 4 s, request 8c3d0b6a-140b-44cd-a187-af5e6b4e52f1, likeness 68 |
| recast/swap-me-in, dance-double | .mp4, 18 KB | 3 s of `public/samples/concert-recast.mp4`, no Router call |
| recast/concert-stage | .webp, 33 KB | Nano Banana 2.1 1K Fast, request c7583fdb-163a-4910-9792-620e65e49a53, likeness 86 |
| recast/neon-performance | .webp, 19 KB | Nano Banana 2.1 1K Fast, request c12f2ba8-e43f-451d-9b49-7abc7deb3880, likeness 79 |
| recast/same-move-new-city | .webp, 53 KB | Nano Banana 2.1 1K Fast, request 2cf53857-de77-4028-b4be-ff6b708b580e, likeness 80 |
| recast/stunt-double | .webp, 34 KB | Nano Banana 2.1 1K Fast, request f5fbda99-eaba-4ece-a861-50591c50ac22, likeness 63 |
| recast/outfit-change | .webp, 37 KB | Nano Banana 2.1 1K Fast, request 363f443f-cc90-4fe7-b88c-d6d331a54adc, likeness 97 |
| recast/product-swap | .webp, 30 KB | Nano Banana 2.1 1K Fast, request aca7256e-47ae-40b4-9997-6e78412d55fc, likeness 100 |
| recast/sneaker-swap | .webp, 43 KB | Nano Banana 2.1 1K Fast, request 9b2e233e-29b6-4169-835c-ba415c2b1c42, likeness 85 |
| recast/new-background | .webp, 24 KB | Nano Banana 2.1 1K Fast, request 7abc179f-694f-431a-a1c3-0a43e46b31e8, likeness 82 |
| recast/claymation | .webp, 31 KB | Nano Banana 2.1 1K Fast, request 95d47ec0-c579-459b-b064-86496c60cca2, likeness 65 |
| recast/film-1970s | .webp, 30 KB | Nano Banana 2.1 1K Fast, request aabbdd48-a5f7-4c08-a566-dfea106f7b03, likeness 100 |

Spend, at the published rates: 10 image stills and 10 Recast stills at about $0.05 each ($1.00),
five H3 loops at about $0.59 each (a 2K still and a 4 s 768p clip, $2.95) and one Seedance 4 s draft
($0.59): about $4.54. Router didn't report `X-Comfy-Credits-Used`, so that's the estimate, not a
measured figure. The first run hot-reloaded its page when a source file changed mid-run, and every
job after that failed before submitting, except perhaps one image already in flight (at most $0.05,
its result lost). The script now runs its dev server without file watching.

Most stills of Walt score 80 and up. A few score low for the reasons the spec gives: Action poster
(0: a small full-length figure), Park bench duo (39: a laughing three-quarter view beside a second
person), Stunt double (63: mid-leap) and Claymation (65: a stylised look). Each shows Walt; they're
tile thumbnails, not takes, so they stay. The Recast stills show what a preset does rather than a
real recast of a clip; only Swap me in and Dance double, which the sample clip already shows, loop.
