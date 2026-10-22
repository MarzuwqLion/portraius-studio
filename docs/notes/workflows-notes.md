# Workflows notes: every feature with a partner node

Asked for on October 21: the studio's features as ComfyUI workflows in the repo, for the contest. Ten graphs
join the two from M8, so `workflows/` now has twelve, each as a UI graph and a Workflow (API) file. No
Contracts change, no Dexie version and no Router call from the app.

## What was added

| Graph | From the app's code |
| --- | --- |
| `design-from-text` | `candidateInput` (1K, Fast) four times with fixed seeds, Batch Images and Get Image from Batch as the pick, then the person sheet from the pick |
| `element-sheet` | `elementCompositeInput` and `elementViewInput` for outfit, prop and location, one group each (prop on, the others bypassed) |
| `image-studio` | The Film still preset compiled with Walt; an edit with `editing: true`, so the source is image 1 and the satchel's sheet image 2 |
| `video-studio` | Seedance 2.5 text-to-video draft and its final; the Product reveal preset on H3 with an element's sheet (the app sends any references-mode cast to H3); a frame with a face on H3 |
| `recast` | The Concert stage, Claymation and Product swap presets: `compileVideoPrompt` with references, `nearestRatio`, the motion `LIMITS`, `settingPrompt`, and the clip's own audio put back with Get Video Components and Create Video |
| `make-it-real` | `freepikSkin.buildBody` at `DEFAULT_STRENGTH`: skin detail 80, sharpen 10, grain 4 |
| `add-a-line` | George from `presets/voices.json`; Sync-3's `sync_mode` from its adapter; `speakingScene` and `speakingDuration` for the H3 speaking clip |
| `kling-one-take` | The Tour's sample scene via a new `sampleScene()` in `lib/tour/tour.ts`, `compileOneTakeShots`, `oneTakeDurations` and `shotCamera` |
| `director-scene` | The same scene: `shotScene`, `shotCamera` and `shotSeed` per shot, anchors at 2K Fast, H3 takes, Concatenate Video |
| `draft-shots` | `agentRequest`: the system prompt, scene card, max tokens and effort, with the shot-list schema written into the prompt |

`src/lib/workflows/graph.ts` now holds the graph builder and the shared nodes, `comfy.ts` the M8 graphs and
the node pack's example (unchanged, byte for byte), and `studio.ts` the new ones. `startSampleScene` builds its
scene with `sampleScene()`, so the Tour and the workflows can't drift apart.

## Calls made without asking

- **Everything in one graph per feature group** rather than one file per mode: Video's three modes share
  video-studio, Recast's presets share recast. Fewer files to find, and each row stands alone.
- **Prop is the element type that starts on**, because the satchel is the sample element.
- **Kling's references are padded, not cropped.** Kling's node takes one image batch, and Batch Images resizes
  every image to the first one's shape with a centre crop, which cut Walt's 4:5 front view to a strip across his
  face. Resize and Pad Image brings it to 1920×1080 first.
- **The Recast object swap puts the original audio back** with Get Video Components and Create Video, since
  HappyHorse's node has no audio setting and the app asks Router for `audio_setting: "origin"`.
- **No Image Compare in make-it-real.** It needs a frontend-only widget that the API format can't carry.

## Checks

- `workflows:check` now handles growing inputs named by prefix (`videos.video0`, `images.image0`), treats Load
  Video's file like Load Image's, and checks required inputs inside a model's options as well as at the top level,
  which ComfyUI's own `_expand_schema_for_dynamic` does: a growing list requires only its first `min` slots. A
  copy of recast with `model.ratio` and Create Video's `images` removed was flagged for both. All twelve files run
  clean against Comfy Cloud's `/api/object_info`.
- New tests: no Seedance node has a person anywhere upstream, every image node is Nano Banana 2.1 with no system
  prompt, Kling's storyboards add up to its duration and fit 512 characters, Recast's chain and audio source, the
  skin settings, and the Director's anchor setting and cut order.
- Comfy Cloud's `/api/prompt` still answers `403 FREE_TIER_NOT_ALLOWED` for this key, but a local ComfyUI
  runs partner nodes with the same key passed as `extra_data.api_key_comfy_org` on `/prompt`, no sign-in needed.
  A shallow clone of ComfyUI master (0.42.0) in a scratch venv with CPU torch ran all eleven graphs that don't
  need real photos, at 1K MINIMAL images, 4 s clips and a 3 × 1 s one-take. Every one succeeded; the results are
  in the workflows README. The recast and object-swap outputs carry an audio track, the lip sync came back at the
  line's 3.6 s (Sync-3's `cut_off`), and the joined scene is 13.4 s from three takes. Not checked: opening the UI
  graphs in the ComfyUI frontend by hand.

## Found along the way

- **The Director's shot prompt had no full stop before the location** when the action didn't end with one:
  `shotScene` joined them with a space, so the Tour's sample shots sent "…rain on the window Location: A
  late-night diner with red vinyl booths." Fixed on Marzuwq's go-ahead: an action without a full stop gets one
  before the location (tested), and director-scene was regenerated. It changes the anchor and take prompts for
  such shots; the Kling one-take already wrote the location as its own sentence.
