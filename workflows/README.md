# ComfyUI workflows

Every studio feature that has a ComfyUI partner node, as a graph. Each comes in two formats: the `.json` file is
the graph you open and edit, and the `.api.json` file is the **Workflow (API)** format, for sending to a ComfyUI
server's `/prompt` route from a script.

| File | What it reproduces | Partner nodes |
| --- | --- | --- |
| `character-sheet` | Photos to a character: the 16:9 turnaround sheet from every photo, then the front, three-quarter, profile and full-body views from the photos plus that sheet | Nano Banana 2.1 |
| `design-from-text` | Design from text: four candidate faces from a description, a pick, then the same sheet and views | Nano Banana 2.1 |
| `element-sheet` | An outfit, prop or location from a photo, as a product-style sheet and four views | Nano Banana 2.1 |
| `image-studio` | A still with a cast in it, and an edit of a source image with a cast's references | Nano Banana 2.1 |
| `still-first-video` | The Video studio's "Image, then animate": a still with the character, animated on MiniMax H3; a shot without people as a cheap Seedance draft, then its 1080p final | Nano Banana 2.1, MiniMax H3, Seedance 2.5 |
| `video-studio` | The other video modes: text to video, use references, animate an image | Seedance 2.5, MiniMax H3 |
| `recast` | Motion transfer with a new setting and the clip's own audio (a music-video preset), a style swap, an object swap | MiniMax H3, HappyHorse |
| `make-it-real` | The realism pass on a still | Magnific Skin Enhancer |
| `add-a-line` | A line in a stock voice, then lip-synced onto a clip, or spoken in a new clip | ElevenLabs, sync.so, MiniMax H3 |
| `kling-one-take` | The Director's one-take: the whole scene as one Kling clip, one storyboard per shot | Kling 3.0 Omni |
| `director-scene` | A Director scene: an anchor still per shot, a take from each, joined in order | Nano Banana 2.1, MiniMax H3 |
| `draft-shots` | The Director's "Draft with AI": Claude plans the shot list from the scene card | Anthropic Claude |

## Open them

1. Use a current ComfyUI (desktop, portable or Comfy Cloud at [cloud.comfy.org](https://cloud.comfy.org)). Partner
   nodes need you signed in to a Comfy account with credits: they call the same providers the app does.
2. Drag the `.json` file onto the canvas, or use **Workflow → Open**.
3. Add the inputs (below) to `ComfyUI/input/`, or pick them in each Load Image and Load Video node.
4. Run. Each graph's note says what it does and what to change.

Groups or nodes that start bypassed (purple) are a second step or another option: select them and press
**Ctrl+B** to turn them on.

### Inputs

Most graphs use the sample character, Walt Harmon, and samples from [`public/samples/`](../public/samples/):

| File | Used in | What it is |
| --- | --- | --- |
| `walt-sheet.jpg`, `walt-front.jpg` | still-first-video, image-studio, recast, add-a-line, kling-one-take, director-scene | Walt's sheet and front view. For your own character, unzip its `.portraius` file (it's a zip): use `sheet/turnaround.png` and `sheet/front.png` |
| `satchel-sheet.jpg` | image-studio, video-studio, recast | An element's sheet (a leather satchel) |
| `walt-diner.jpg` | image-studio, video-studio, make-it-real | A finished still with Walt in it |
| `concert-original.mp4` | recast | The Tour's Recast clip: a designed performer, 8 s |
| `walt-looks-up.mp4` | add-a-line | A finished clip of Walt |

Your own files:

- **character-sheet:** three photos of yourself as `my-photo-1.jpg`, `my-photo-2.jpg` and `my-photo-3.jpg`.
  Varied angles, good light, one face each. Add Load Image nodes for up to 10 and wire them into every Nano
  Banana node's next image slot.
- **element-sheet:** a photo of the thing as `my-prop-1.jpg` (or `my-outfit-1.jpg`, `my-location-1.jpg`).
- **recast, object swap:** a clip of someone holding a product as `my-product-clip.mp4`.

Only use photos of yourself or of someone who agreed to it, and clips you filmed or have the rights to.

## Partner nodes used

| Node (as listed in ComfyUI) | Node ID | The app's model | Used in |
| --- | --- | --- | --- |
| Nano Banana 2.1 | `GeminiNanoBanana2V2` | Nano Banana 2.1 (`vertexai/gemini-nano-banana-2.1`) | character-sheet, design-from-text, element-sheet, image-studio, still-first-video, director-scene |
| MiniMax H3 First-Last-Frame to Video | `MinimaxHailuo03FirstLastFrameNode` | MiniMax H3 at 768p | still-first-video, video-studio, director-scene |
| MiniMax H3 Reference to Video | `MinimaxHailuo03ReferenceNode` | MiniMax H3 with reference images, videos or audio | video-studio, recast, add-a-line |
| ByteDance Seedance 2.5 Text to Video | `ByteDance2TextToVideoNode` | Seedance 2.5 Draft at 480p | video-studio |
| ByteDance Seedance 2.5 First-Last-Frame to Video | `ByteDance2FirstLastFrameNode` | Seedance 2.5 Draft at 480p | still-first-video |
| ByteDance Seedance 2.5 Draft to Final Video | `ByteDance2DraftToFinalVideoNode` | Seedance 2.5 at 1080p, from the draft's ID | still-first-video, video-studio |
| HappyHorse Video Edit | `HappyHorseVideoEditApi` | HappyHorse 1.0 video edit at 720P | recast |
| Magnific Image Skin Enhancer | `MagnificImageSkinEnhancerNode` | Freepik skin enhancer, faithful | make-it-real |
| ElevenLabs Voice Selector, ElevenLabs Text to Speech | `ElevenLabsVoiceSelector`, `ElevenLabsTextToSpeech` | ElevenLabs v4 | add-a-line |
| sync.so Lip Sync | `SyncLipSyncNode` | Sync-3 | add-a-line |
| Kling 3.0 Omni Image to Video | `KlingOmniProImageToVideoNode` | Kling V3 Omni, multi-shot | kling-one-take |
| Anthropic Claude | `ClaudeNode` | Claude Sonnet 5.5 | draft-shots |

Plus core nodes: Load Image, Load Video, Save Image, Save Video, Save Audio, Save Text, Preview as Text, Batch Images,
Get Image from Batch, Resize and Pad Image, Get Video Components, Create Video, Concatenate Video and notes.

## How they match the app

- **Same prompts.** The graphs are generated by [`src/lib/workflows/`](../src/lib/workflows/) from the app's own
  code: the sheet, candidate and element prompts in `lib/characters/`, the prompt compiler in `lib/prompts/compile.ts`
  (reference legend, identity lock, scene, camera, realism), the presets in `presets/`, Recast's setting step,
  the speaking-clip prompt, the Director's shot prompts and the Tour's sample scene, and the Director agent's
  system prompt and scene card. A test fails if the files here drift from the code; `npm run workflows` rebuilds
  them.
- **Same settings.** Nano Banana 2.1 at 2K with HIGH thinking (the app's "Best"), or MINIMAL ("Fast") where the
  app uses it: candidate faces at 1K and Director anchors at 2K. No system prompt. References in the order the
  prompt's legend names them. H3 at 768p, HappyHorse at 720P, Kling at 720p (its "std"), the skin enhancer at the
  app's default strength, Sync-3 cutting the longer of clip and line to the shorter.
- **People render on MiniMax H3.** Seedance 2.5 refuses photoreal people as input images, so the app renders every
  clip with a person on H3 (decided October 19), and so do the graphs: any cast in references mode, any first
  frame with a face, Recast and the speaking clip. Seedance 2.5 keeps shots without people, with the app's
  draft-then-final step: the final node starts bypassed. Paste the draft's `draft_task_id` from **Preview as Text**,
  turn the final and its Save Video back on, and run again. The draft node's seed is fixed, so it isn't drawn again.
  A test checks that no Seedance node has a person anywhere upstream.

### Where a graph differs from the app

| Graph | The app | The graph |
| --- | --- | --- |
| design-from-text | You click the face you want | Set **Picked face**'s batch_index and run again; the candidates are kept |
| element-sheet | One element type per make | All three types, one group each; outfit and location start bypassed |
| recast | ffmpeg in the browser puts the clip's audio back on the music-video presets, and HappyHorse keeps it on an object swap | Get Video Components and Create Video put the source clip's audio on the edit; HappyHorse's node has no audio setting |
| make-it-real | Freepik's skin enhancer | Magnific's Skin Enhancer with the same settings. Magnific is Freepik's, so very likely the same model, but that isn't confirmed |
| add-a-line | ElevenLabs' text-to-dialogue route | ElevenLabs text to speech with the same model and voice. Set H3's duration to the line's length plus a second |
| kling-one-take | Each reference image sent as is | One batch: Batch Images makes every image the first one's size, so the front view is padded to 16:9 first rather than cropped |
| director-scene | 2 to 4 anchors per shot to pick from; straight cuts or crossfades; "continue" shots start on the last frame before | One anchor per shot, straight cuts only (Concatenate Video); the sample scene has no "continue" shots |
| draft-shots | Structured output against a JSON schema, then each shot checked and added to the shot list | The schema is written into the prompt; the plan comes back as text, saved as JSON. It can't drive the rest of the graph |

- **What no graph does.** No webcam consent check, identity score, automatic drift retry or realism re-score:
  those live in the app. The node pack in [`custom_nodes/comfyui-portraius-characters`](../custom_nodes/comfyui-portraius-characters/)
  brings characters, the app's prompt and an identity score into ComfyUI: it loads a `.portraius` file instead of
  loose images.
- **Partner nodes go through Comfy's API proxy** rather than Comfy Router, so they bill to the signed-in account
  and serve the same models through ComfyUI's own integration.

## Checked against ComfyUI

`npm run workflows:check` (with `COMFY_API_KEY` in your shell) compares every `.api.json` file with the node
definitions ComfyUI publishes at Comfy Cloud's `/api/object_info`. It checks that every node exists, that every
input name is one the node takes (including the dotted names of dynamic inputs like `model.images.image_1` and
`videos.video0`), that every choice is one of its options, and that every required input is there, including
those inside a model's own options. All twelve ran clean on October 21, 2026. Nothing executes, so it costs nothing.
`OBJECT_INFO_URL=http://127.0.0.1:8188/object_info` checks against a local ComfyUI instead, no key needed; where that
ComfyUI has the node pack, its example graph is checked too.

### Run end to end

On October 21, 2026, every graph except character-sheet ran to completion on a local ComfyUI (0.42.0, CPU), with
the partner nodes billed to a Comfy API key passed as `extra_data.api_key_comfy_org` on `/prompt`. To keep it
cheap, images ran at 1K with MINIMAL thinking, clips at 4 s, and the one-take as three 1 s storyboards. Stand-ins:
the satchel's sheet as element-sheet's photo, and `walt-looks-up.mp4` as the object swap's clip. character-sheet
wasn't run because it needs real photos of a person; design-from-text runs the same sheet nodes.

| Graph | Result |
| --- | --- |
| design-from-text | Four candidate faces, then a consistent sheet and four views from the first |
| element-sheet | The prop's sheet and its front, three-quarter, side and detail views |
| image-studio | Walt in the Film still preset at 21:9; the satchel added beside him in the edit, the rest unchanged |
| still-first-video | The character still animated on H3; the empty shot as a Seedance draft, with its `draft_task_id` |
| video-studio | A Seedance text draft and its ID, an H3 clip from the satchel's sheet, an H3 clip from Walt's still |
| recast | Motion transfer, the new setting and the original audio; the claymation style swap; the object swap with its audio back on |
| make-it-real | The still with skin texture and grain |
| add-a-line | The line as an MP3, lip-synced onto a clip (cut to the line's 3.6 s) and spoken in a new H3 clip |
| kling-one-take | One 3 s clip from three storyboards |
| director-scene | Three anchors, three H3 takes, joined into one 13.4 s scene |
| draft-shots | Five shots as JSON, every camera pick one of the app's preset IDs |

Comfy Cloud's own `/api/prompt` refuses API keys from free-tier accounts, so the graphs weren't run there.
