# Portraius Studio

Make a character of yourself once, then put them in images, videos and recasts that still look like
you, with a number that says how much.

Portraius Studio is an open-source, browser-only studio built on Comfy Router. Your characters are
portable `.portraius` files you keep; every output gets an identity score against your own photos; and
everything runs in your browser with your own Comfy key.

## Try it

**https://marzuwqlion.github.io/portraius-studio/**: open it, paste a Comfy API key with Router access
in Settings, and make a character. To try it without your own face, choose **Design from a
description**.

## Why it's different

- **Portable characters.** A character is a `.portraius` file: photos, a turnaround sheet, face data
  and a consent record. Export it, back it up, send it to someone you're making things with.
- **Consent built in.** A character from photos needs a short webcam check (three random prompts and a
  face match) and the subject's typed name. Imports without consent stay locked.
- **An identity score on everything.** Each output with a cast member is scored 0 to 100 against that
  character's references, in your browser. Images that drift get one automatic retry.
- **Recast.** Keep a clip's motion and camera; swap in your character, swap one object, or change the
  look. Original and recast play side by side.
- **Presets anyone can add.** Camera, look and Recast presets are JSON files in `presets/`.

## Quick start

Node 22 or newer.

```sh
npm ci
npm run dev
```

Open the local URL, go to **Settings**, paste a Comfy API key with Router access. The key stays in your
browser: `sessionStorage` by default, or IndexedDB if you tick "Remember on this device".

`npm test` runs the unit tests. `npm run smoke` runs one image and one video draft against Router with
the key in your shell's `COMFY_API_KEY`.

## Models

Every call goes through [Comfy Router](https://docs.comfy.org). Model IDs live in one file,
`src/lib/registry/models.ts`.

| Model | Router ID | What it does here |
| --- | --- | --- |
| Nano Banana 2.1 | `vertexai/gemini-nano-banana-2.1` | Character sheets, designed faces, every image, Still first's opening frame |
| Seedance 2.5 | `byteplus/dreamina-seedance-2-5-260628` | Default video without people: 480p draft, then a 1080p final from the draft's ID |
| MiniMax H3 | `minimax/minimax-h3` | Every video with a person in it, and Recast's Motion Transfer (Seedance refuses photoreal people) |
| Kling V3 Omni | `kling/kling-v3-omni` | Recast's Object Swap (clip edit with a reference image) |
| Wan 2.7, HappyHorse 1.0, BFL video edit | `wan/wan2.7-videoedit`, `wan/happyhorse-1.0-video-edit`, `bfl/video-edit-v1` | Object Swap candidates, compared in `docs/notes/recast-ab.md` |

No request ever sends `model_provider`; queued requests are always served by the model's own provider.

## Costs

Every Generate button shows a price before it runs, or "price unknown" when Router's `/estimate` isn't
enabled for your key. Video starts as a cheap 480p draft on Seedance; you render the 1080p final only
when you like the draft.

## How it works

```
Browser (GitHub Pages)                          Comfy Router          Provider
Studio UI -> Router client -------------------> queue --------------> Google, BytePlus,
(prompt,     (model allowlist, your key)        (request ID)          MiniMax, Kling
 image prep)
Library   <- download (bytes saved in IndexedDB) <- result <-----------+
 + identity score (face-api, in the browser)
```

A small Cloudflare Worker (`proxy/`) does the two things a browser can't: it hosts short-lived
copies of clips that providers fetch by URL (R2, deleted after a day), and streams back results from
hosts that send no CORS headers. It never stores a key. See `proxy/README.md`.

| Folder | Holds |
| --- | --- |
| `src/lib/router` | The only code that talks to Router |
| `src/lib/jobs` | The job state machine and runner (queue, poll, download, score, resume after reload) |
| `src/lib/adapters` | One adapter per model: app input to native body, native result to assets |
| `src/lib/characters` | The create wizard, consent check, sheets, `.portraius` import and export |
| `src/lib/identity` | face-api detection, the distance-to-score mapping, face-to-cast assignment |
| `src/lib/studio` | Image, Video and Recast logic |
| `presets/` | Camera, look and Recast presets |
| `proxy/` | The Cloudflare Worker |
| `docs/` | The build spec and per-milestone notes |

## Responsible use

- The consent record is an attestation, not proof: the person on camera says they're the person in the
  photos and are 18 or older. It's stored in the character file.
- Don't use Portraius Studio to impersonate anyone. Recast only takes faces from your vault, never from a
  random photo.
- The identity score measures likeness to a character's references, not who someone is. Faces generated
  from the same description can look alike to it.
- Every Recast asks you to confirm you filmed the clip or have the rights to it.
- To report misuse, open an issue on this repository.

## Contributing presets

Copy any file in `presets/`, change it, and open a pull request. Presets are validated by the build;
keep them free of brand and celebrity names.

## License

MIT, see `LICENSE`. Model outputs are subject to each provider's own terms.

Bundled third-party files: face-api weights (`public/models/`, MIT) and the ffmpeg.wasm core
(`public/ffmpeg/`, GPL-2.0-or-later, loaded as a separate program in a web worker; source at
https://github.com/ffmpegwasm/ffmpeg.wasm).
