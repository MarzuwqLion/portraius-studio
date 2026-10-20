# M8 notes: submission

## Tour mode

`#/tour` plays pre-made outputs from `public/samples/` with no key and no model call. Each sample is
labelled "Pre-made sample". All of them use Walt Harmon, the designed character, or have no person in them;
the Recast's original performer is a designed person made with H3 for testing (recast-ab.md).

| Section | Samples |
| --- | --- |
| Character | Walt's turnaround sheet and four views |
| Images | Three stills with their scores: 96, 98, 94 |
| Make it real | Before and after with both scores (96 to 81) |
| Video | A Seedance 480p draft and its 1080p final (no people), an H3 clip of Walt (95, worst frame 93) |
| Recast | The split view (Motion Transfer on H3, 89.5) and its 9:16 export with the end card |
| Director | "The Letter", the 3-shot scene from M6 |
| Elements | The leather satchel's reference sheet |

`tour.json` describes each sample; a test checks that every file it names exists, that nothing unused ships,
that the folder stays under 25 MB (it's 16 MB), and that the sample character imports unlocked. Stills are
JPEGs at 1600 px, and every file went through the AI-generated tagger. The Tour can add Walt to the visitor's
vault from `walt-harmon.portraius` (2.5 MB: his sheets as JPEG, which the file format allows), so a judge
with a key can make a first image without making a character.

Samples were picked from the local library in the browser and written to `public/samples/` through a
dev-server-only route (`/__dev/samples/`, never in a build). When Marzuwq provides the sample character,
rerun that pick with the new character and rewrite `tour.json`.

**Realism score drop.** The skin pass on Walt's diner still took the score from 96 to 81 at strength 80
(request `e5d58402-96a6-4c2a-ab1b-592ad155a4f8`, 81 s, 3840×4800 out). Still a strong match, but the
pass shifts face-api's descriptor, which is why the spec asks for a fresh score after it.

## ComfyUI workflows

`workflows/character-sheet` and `workflows/still-first-video`, each as a UI graph and a Workflow (API)
file, with a README. Node IDs and inputs come from current ComfyUI and Comfy's own templates:

| Model | Node ID |
| --- | --- |
| Nano Banana 2.1 | `GeminiNanoBanana2V2` ("Nano Banana 2.1"), model "Gemini Nano Banana 2.1" |
| MiniMax H3 | `MinimaxHailuo03FirstLastFrameNode` |
| Seedance 2.5 | `ByteDance2FirstLastFrameNode` with "Seedance 2.5 Draft", then `ByteDance2DraftToFinalVideoNode` |

These nodes' per-model inputs are dynamic: in both formats they're named with dots (`model.resolution`,
`model.images.image_1`), which is how ComfyUI's `_io.py` flattens them.

- **Generated, not hand-written.** `src/lib/workflows/comfy.ts` builds both graphs from the app's own sheet
  prompts and prompt compiler; a test fails when the files drift; `npm run workflows` rewrites them.
- **People on H3.** The spec planned Seedance for still-first, but Seedance refuses photoreal people, so
  the character row animates on H3 like the app; a second row does a shot without people as a Seedance
  draft, with the final bypassed until the user pastes the draft's ID. The API file leaves bypassed nodes
  out, as ComfyUI's own Export (API) does.
- **Checked, not run.** `npm run workflows:check` compares every node, input name and option against the
  definitions at Comfy Cloud's `/api/object_info`; it runs clean. A real run wasn't possible: Comfy Cloud's
  `/api/prompt` answered `403 FREE_TIER_NOT_ALLOWED` ("API key authentication is not available for free
  tier accounts"), and there's no local ComfyUI here. Marzuwq is signed in to Comfy Cloud on the free tier
  (4 of 5 runs left); one run of `still-first-video.json` there is the full check.

## README

Rewritten to the spec's outline: pitch and a GIF of a Recast side by side (`docs/media/`, 3.1 MB, made with
ffmpeg.wasm from the Tour's Recast sample), Try it (Pages and the Tour), why it's different, quick start,
models with Router IDs, costs, architecture and repo map, ComfyUI workflows, responsible use, contributing
presets, and licenses (model terms are separate). Writing it turned up one gap: the spec's Security table
promises "Delete all data" in Settings, which didn't exist. It does now: the whole IndexedDB database and the
site's caches, after a confirm step.

## Accessibility (Lighthouse 90+ on each screen)

Lighthouse 12.8.2, accessibility only, on the production build (`vite preview`) in a fresh headless Chrome:
**100 on all 14 screens** (`#/`, characters, the create chooser and all three wizard paths, image, video,
recast, director, library, remix, settings, tour). The first run scored 95 to 96 on five screens: the hidden
file inputs behind Upload buttons had no names. They're named and out of the tab order now.

A fresh profile only shows empty states, so axe-core 4.10.3 (Lighthouse's engine) also ran in the local
browser against populated screens: a character's page, the library and a take's page, Image, Video, Recast
and Director with real takes, in light and dark. It found the cast pickers not tied to their Field labels,
two selects with no label (Recast's library picker, Director's still count), and the Video set's secondary
buttons and error line drawn in ink on Studio grey (2.6:1). All fixed; every screen is clean in both themes.

## Contrast (both themes)

`src/styles/tokens.test.ts` reads `tokens.css`, resolves `var()` and `color-mix()`, and checks the spec's
targets in both themes. It also fails on any colour value in `src/` outside `tokens.css`.

| Pair | Light | Dark | Target |
| --- | --- | --- | --- |
| Ink on proof | 12.8 | 11.9 | about 12:1 |
| Muted ink on proof | 5.5 | 6.9 | 4.5 |
| Text on Studio grey | 5.0 | 6.5 | 4.5 |
| Primary button label | 12.8 | 11.9 | 4.5 |
| Strong match / Check / Drift on proof | 5.3 / 5.0 / 6.0 | 7.1 / 7.5 / 6.1 | 4.5 |

**Open: the grease mark.** The pick circle on Studio grey is 1.2:1 (light) and 2.3:1 (dark) by luminance,
under WCAG's 3:1 for graphics (1.4.11). The red reads clearly by hue, and every pick is also `aria-pressed`,
so Lighthouse and axe pass, but a viewer who can't tell red from grey sees a faint mark. The colours are
the spec's (Visual direction), so changing them is Marzuwq's call; a lighter grease in light mode, or a thin
proof-coloured halo under the stroke, would fix it.

## Smoke and deploy

Below.

### Final smoke (October 20, 14:19 UTC)

`npm run smoke` passed in 99 s: catalog has all 12 registry models, estimate is still "price unknown"
(`/estimate` isn't enabled for the key), a Nano Banana 2.1 image (request
`6de75250-f6a1-423a-a1ff-1a6c8b86e055`), a Seedance 4 s 480p draft through the Worker (request
`c9668162-aacc-405b-9732-fc5b5499bdbf`), and a queued handle rebuilt from a stored request ID. Pushing
`main` deploys GitHub Pages.
