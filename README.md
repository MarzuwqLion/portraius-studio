# Portraius Studio

Make a character once, from your own photos or a description, then put them in images, videos, recasts
and scenes that still look like them, with a number that says how much.

![Recast: a dancer's clip, then the same moves, timing and camera performed by Walt Harmon, a designed character](docs/media/recast-side-by-side.gif)

Portraius Studio is an open-source studio that runs in your browser on the
[Comfy Developer Platform](https://docs.comfy.org). Every generation goes through Comfy Router with your own
Comfy key; your characters and outputs stay in your browser. Built for Comfy's Open Source Higgsfield
competition (#OpenSourceHiggsfield).

## Try it

**[marzuwqlion.github.io/portraius-studio](https://marzuwqlion.github.io/portraius-studio/)**

- **No key?** Open the [Tour](https://marzuwqlion.github.io/portraius-studio/#/tour). It plays pre-made samples
  made with Walt Harmon, a designed character: his sheet, scored stills, a realism pass, video drafts and
  finals, a Recast, a Director scene and an element. Nothing calls a model.
- **With a key:** paste a Comfy API key with Router access in **Settings**. It stays in your browser and goes
  only to Comfy. The Tour can add Walt to your vault, so a first image needs only the key; or make a character
  from your photos (with a webcam consent check), or design one from a description.

## Why it's different

- **A character is a file you own.** A `.portraius` file is a zip of the photos, a turnaround sheet with four
  views, face data and the consent record. Export it, back it up, send it to someone you're making things with,
  import it on another machine, or open it in ComfyUI with the node pack. Elements (outfits, props, locations)
  use the same format.
- **Consent is built in.** A character from photos needs a short webcam check (three random prompts, a head-turn
  check and a face match against the photos) and the subject's typed name and 18+ statement. An import without a
  consent record stays locked: viewable, never usable.
- **An identity score on everything.** Each output with a cast member is scored 0 to 100 against that character's
  own references, in the browser with face-api (calibrated on 20 same-person and 20 different-person pairs). An
  image that drifts under 60 gets one automatic retry; videos are scored one frame a second.
- **Recast and Director, open.** Recast (the Genjutsu rebuild) keeps a clip's motion and camera and swaps in a
  character from your vault, swaps one object, or restyles it, with original and result side by side. Director
  (the Cinema Studio rebuild) plans a scene as shots with camera and lens controls, an anchor still per shot,
  a clip per shot, and one stitched MP4. A shot can pick up from the last frame of the one before; Kling can shoot
  the whole scene as one quick take; Claude can draft the shot list from a logline.
- **Presets anyone can add.** Camera moves, looks, image, video and Recast presets are JSON files in `presets/`,
  checked on every pull request. Any result can be shared as a remix link that carries the recipe, never a face.
- **Voices and lip sync.** Give a character one of 12 stock voices, write a line, and either lip-sync an existing
  clip to it (Sync-3) or have MiniMax H3 draw a new clip of the character saying it. Director shots can speak too.
  Stock voices only: no voice cloning.
- **Finishing.** "Make it real" adds skin texture to a still and scores it again, with a before/after wipe.
  "Export 9:16" puts a clip, or a Recast's original and result, in one vertical frame with an optional end card.
  Every file you download is tagged as AI-generated (see Responsible use).

## Quick start

Node 22 or newer.

```sh
npm ci
npm run dev
```

Open the local URL it prints, go to **Settings** and paste a Comfy API key with Router access
([platform.comfy.org](https://platform.comfy.org)). The key is kept in `sessionStorage`, or in IndexedDB if you
tick "Remember on this device". There's no `.env` key and no server to hold one.

| Command | Does |
| --- | --- |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | TypeScript across the app, scripts and Worker |
| `npm run smoke` | One image, one video draft, an estimate and a resumed job against real Router calls, with `COMFY_API_KEY` from your shell (costs cents) |
| `npm run presets:check` | Validates `presets/` |
| `npm run workflows` / `workflows:check` | Rebuilds `workflows/` from the app's prompts / checks them against ComfyUI's node definitions |
| `npm run nodepack` | Rebuilds the ComfyUI node pack's presets, prompt cases and example workflow from the app |
| `npm run voices:check` | Speaks one line in every voice in `presets/voices.json` through Router (costs cents) |
| `npm run build` | The static site in `dist/`, as GitHub Pages serves it |

## Models

Every call goes through [Comfy Router](https://docs.comfy.org/development/comfy-router/queue.md), queued so it
survives a reload; only ElevenLabs runs on Router's synchronous route, because it answers with the audio itself.
Model IDs live in one file, `src/lib/registry/models.ts`. No request sends `model_provider` (and the synchronous
call sends `fallback_provider=false`), so each model is served by its own provider.

| Model | Router ID | What it does here |
| --- | --- | --- |
| Nano Banana 2.1 | `vertexai/gemini-nano-banana-2.1` | Character sheets and views, designed faces, element sheets, every image, the opening frame in Image, then animate, Director's anchors |
| Seedance 2.5 | `byteplus/dreamina-seedance-2-5-260628` | Video without people: a 480p draft, then a 1080p final from the draft's ID |
| MiniMax H3 | `minimax/minimax-h3` | Every video with a person in it, and Recast's Motion transfer. Seedance refuses photoreal people as input images |
| HappyHorse 1.0 video edit | `wan/happyhorse-1.0-video-edit` | Recast's Object swap and Setting changes, keeping the clip's timing |
| Freepik skin enhancer | `freepik/ai-skin-enhancer-faithful` | Make it real |
| Kling V3 Omni | `kling/kling-v3-omni` | Director's one-take: every shot of a scene in one clip, each with its own prompt |
| ElevenLabs v4 | `elevenlabs/eleven_v4` | A character's lines, in 12 checked stock voices |
| Sync-3 | `synclabs/sync-3` | Lip sync: moves the mouth of a finished clip to a line |
| Claude Sonnet 5.5 | `anthropic/claude-sonnet-5-5` | Director's "Draft shots with AI" |
| Wan 2.7, BFL video edit | `wan/wan2.7-videoedit`, `bfl/video-edit-v1` | Object swap alternatives, compared with Kling in [`docs/notes/recast-ab.md`](docs/notes/recast-ab.md) |

## Costs

Every Generate button shows the price before it runs: Router's own figure when `/estimate` is enabled for your key,
otherwise "≈ $0.08" from a table of Comfy's published rates (each row cited in
[`docs/notes/u1-notes.md`](docs/notes/u1-notes.md)). A model with no published rate shows no price. Video without people starts as a cheap 480p Seedance draft; you pay for
the 1080p final only when you like the draft, and the final reuses the draft's ID instead of sending everything
again. Results download into your browser as soon as they finish, so Router's links expiring never costs a re-run.

## How it works

```
Browser (GitHub Pages)                          Comfy Router          Provider
Studio UI -> Router client -------------------> queue --------------> Google, BytePlus,
(prompt,     (model allowlist, your key)        (request ID)          MiniMax, Alibaba, Freepik
 image prep)
Library   <- download (bytes in IndexedDB) <---- result <-------------+
 + identity score (face-api, in the browser)
```

The request runs left to right; the result comes back right to left, its bytes saved before the link expires,
then scored in the browser. A small Cloudflare Worker ([`proxy/`](proxy/README.md)) does the two things a browser
can't: it hosts short-lived copies of clips and lines that providers fetch by URL (deleted when the job ends, and
by R2 after a day), and streams back results from hosts a browser can't download from (Comfy's Seedance bucket,
Sync Labs). It forwards requests and stores no keys.

| Folder | Holds |
| --- | --- |
| `src/lib/router` | The only code that talks to Comfy: Router client, error mapping, downloads |
| `src/lib/jobs` | The job state machine and runner: queue, poll, download, score, resume after a reload |
| `src/lib/adapters`, `src/lib/registry` | One adapter per model (app input to native body, native result to assets), the model list, and types generated from Router's schemas |
| `src/lib/characters` | The create wizard's logic, consent check, sheets, elements, `.portraius` import and export |
| `src/lib/identity` | face-api detection, the distance-to-score mapping, face-to-cast assignment |
| `src/lib/studio` | Image, Video, Recast, Director, realism and 9:16 export logic |
| `src/lib/media` | Image prep, ffmpeg.wasm trims and joins, the AI-generated tag |
| `src/routes`, `src/components` | Screens and components |
| `presets/` | Camera, look, image, video and Recast presets |
| `public/samples/` | Tour mode's samples |
| `workflows/` | The ComfyUI workflows |
| `custom_nodes/comfyui-portraius-characters/` | The ComfyUI node pack |
| `proxy/` | The Cloudflare Worker |
| `docs/` | The build spec ([`docs/SPEC.md`](docs/SPEC.md)) and per-milestone notes |

## ComfyUI workflows

[`workflows/`](workflows/README.md) has the app's two core flows as ComfyUI graphs, in UI and Workflow (API)
format, built from Comfy's partner nodes:

- **character-sheet:** your photos to a turnaround sheet and four views, with Nano Banana 2.1.
- **still-first-video:** a still with the character in it, animated on MiniMax H3; and a shot without people as a
  Seedance 2.5 draft, then its 1080p final.

They're generated from the app's own prompt code, so a graph sends what the app sends, and checked against
ComfyUI's published node definitions.

The node pack in [`custom_nodes/comfyui-portraius-characters/`](custom_nodes/comfyui-portraius-characters/README.md)
brings the character file itself into ComfyUI: **Load Portraius Character** (a person from photos needs their
consent record, as in the app), **Character Prompt** (a Python port of the app's prompt compiler, tested word for
word against it, with the reference images it names) and **Identity Score** (0 to 100 on the app's scale, from
FaceNet). Copy the folder into `ComfyUI/custom_nodes/`; an example workflow comes with it.

## Responsible use

- **Consent.** The consent record is an attestation, not proof: the person on camera says they're the person in
  the photos and 18 or older, after a liveness and face-match check. Characters of other real people come from
  those people: they make their own character and send you the file.
- **No impersonation.** Don't use Portraius Studio to impersonate anyone or to make anything they wouldn't agree
  to. Recast only takes faces from your vault, never from a random photo, and every clip needs you to confirm you
  filmed it or have the rights to it.
- **No unlicensed IP.** Elements warn against logos and trademarked designs, and preset checks reject brand and
  celebrity names. Provider safety filters stay at their defaults.
- **Disclosure.** Downloaded images carry an XMP note (the IPTC "trained algorithmic media" source type and
  "AI-generated with Portraius Studio"), and videos an MP4 comment. Files that already carry the provider's signed
  C2PA Content Credentials (Nano Banana, Seedance, BFL) are left as they are, since those already say
  AI-generated and an added byte would break the signature.
- **Biometric data.** Face descriptors and consent clips stay in your browser and leave it only inside a
  `.portraius` file you export. Settings has "Delete all data".
- **The score measures likeness**, not who someone is. Faces generated from the same description can look alike
  to it.
- To report misuse, open an issue on this repository.

## Contributing presets

Copy `presets/_template.json` into `presets/image/`, `presets/video/` or `presets/recast/`, fill it in, run
`npm run presets:check`, and open a pull request. The same check runs on every pull request. Thumbnails use
designed characters, never photos of real people; `npm run thumbnails` makes the built-in ones with Walt Harmon. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

MIT, see [`LICENSE`](LICENSE). The models are not covered by it: each provider's outputs and use are subject to
its own terms, through your Comfy account.

Bundled third-party files: face-api weights (`public/models/`, MIT) and the ffmpeg.wasm core (`public/ffmpeg/`,
GPL-2.0-or-later, loaded as a separate program in a web worker; source at
[github.com/ffmpegwasm/ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm)). Fonts: Big Shoulders Display and
Atkinson Hyperlegible Next (SIL Open Font License).
