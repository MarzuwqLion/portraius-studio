# L1 notes: the local engine

October 22. Built on the `local-engine` branch from Decisions (October 22) and the Local engine section of the spec.
The build machine has no usable GPU (an 8 GB laptop card, which Marzuwq asked to leave alone), so nothing here has
generated a picture yet. Marzuwq runs `npm run local:smoke` on the RTX 4090 desktop before the branch merges.

## Choosing the models

ComfyUI master (October 21) ships workflow templates for every model below, and its `/object_info` has all their
nodes natively, so no custom node pack is needed. Licences were read from each Hugging Face repo on October 22.

| Want | Picked | Not picked, and why |
| --- | --- | --- |
| Characters and images | Qwen-Image-Edit-2511, fp8 (Apache 2.0) | Qwen Image 2.1 takes 10 images at native 2K and would suit sheets better, but its licence is research-only. FLUX dev models are non-commercial. |
| Video | Wan 2.2 14B and 5B (Apache 2.0) | MiniMax H3 has open weights now and runs natively (the app's own people model, with audio), but its community licence excludes the US, EU, UK and Korea. LTX 2.x was not compared. |
| Recast | Wan Animate 2, distilled (Apache 2.0) | It takes raw driving frames, so no pose extraction, and draws the background from the prompt, which folds the setting step into one pass. |
| Speaking clips | Wan 2.2 S2V (Apache 2.0) | InfiniteTalk is image-to-speaking too; S2V shares Wan's files. |
| Make it real | SeedVR2 7B int8 (Apache 2.0) | A restorer, not a skin enhancer like Freepik's; worth judging side by side. |
| Text and vision | Gemma 4 12B int8 (Apache 2.0) through Generate Text | Qwen3-VL is smaller; Gemma's 12B should follow the JSON format better. |

Each graph copies the wiring and settings of Comfy's own template for that model: the samplers, steps, shifts,
LoRAs and node order. Where a template leaves a choice to a switch, the adapter takes the Lightning or distilled
path, for speed.

## What was checked here

- `npm run local:check` against the CPU ComfyUI's `/object_info`: every node, input, option, required input and
  link type in all 14 sample graphs. The check was made stricter (links and types) and `workflows:check` shares it;
  the committed workflows still pass.
- Every sample graph submitted to the real (CPU) ComfyUI: uploads land, and validation fails only on the missing
  model files, which come back as `local_model_missing` with the file's name.
- A graph that needs no model (load an uploaded image, save it) ran end to end through `lib/router/local.ts`:
  upload, `/api/prompt` with our `prompt_id`, `/api/jobs` status, the output read back from `/api/view`. An unknown
  job comes back as `local_lost`.
- The built site, with its CSP, connected to that ComfyUI from the browser once it was started with
  `--enable-cors-header`, and listed the model files. The Image and Video screens show Qwen and Wan, block the run
  while files are missing, and price it "Free · your GPU".

## To check on the 4090 (npm run local:smoke)

`npm run local:smoke` answers every row but 2 and 4: it prints no identity scores and has no design-from-text
sample, so those two are checked in the app (`npm run dev`).

| # | Question | If it fails |
| --- | --- | --- |
| 1 | Qwen draws a 16:9 sheet with consistent panels from 3 photos | Draw the four views first from the photos, and assemble the composite in the browser from the views (the plan discussed with Marzuwq on October 22) |
| 2 | Qwen keeps likeness well enough in a view (face-api score) | Draw each view 3 times and keep the best score automatically |
| 3 | Qwen at 1.6 MP (the 2K size) looks right | Draw 2K at 1 MP too |
| 4 | Qwen-Image-Edit draws a face from text alone (design from text) | Add Qwen-Image's text-to-image model for candidates |
| 5 | Wan 14B with the 4-step LoRAs finishes a 5 s 720p clip in a few minutes | Default to 5B, and offer 14B as the final |
| 6 | Wan Animate 2 in context windows keeps a 10 s clip smooth | Cap local Recast clips at one window (about 3 s) and say so |
| 7 | S2V lip sync follows a recorded line | Try InfiniteTalk |
| 8 | SeedVR2's restore reads as "real" next to Freepik's | Lower the target size, or drop Make it real locally |
| 9 | Gemma 4 12B returns the shot list as JSON | Lower the temperature, or ask for fewer shots |
| 10 | Every file name in `lib/registry/local-models.ts` matches Hugging Face | Fix the name; `npm run local:models` fails loudly on a 404 |

## The 4090 run (October 23)

A fresh ComfyUI portable v0.42.1 (October 19, no custom nodes) on Marzuwq's RTX 4090 (24 GB, 64 GB RAM).
`npm run local:check` passed on the stock release, and all 14 smoke samples finished.

| Sample | Time | Output |
| --- | --- | --- |
| Qwen sheet composite | 50 s | 16:9, front, profile, full body, four expressions |
| Qwen view, still with a cast, edit | 16 s, 8 s, 10 s | |
| Wan 5B text, first frame | 96 s, 86 s | 3 s at 1280×704, 24 fps |
| Wan 14B text, first frame, first and last frame | 89 s, 95 s, 78 s | 3 s at 1280×720, 16 fps |
| Wan Animate recast | 852 s | 7.9 s at 848×480 with the clip's sound (the sample's 8 s clip, uncut) |
| Wan S2V speaking clip | 62 s | 4.9 s at 848×480, 16 fps |
| SeedVR2 | 10 s | 1289×1600 to 1838×2282 |
| Gemma plan, judge | 16 s, 2 s | JSON inside a json code fence, which `localReplyText` strips |

By question:

1. Pass. The sheet's panels are one consistent man and read as Walt.
2. Not run: needs the app (identity scores).
3. Not judged separately; the smoke draws 1K.
4. Not run: needs the app (Design from a description).
5. Likely pass, not measured as asked: the samples are 3 s, and 14B took about 90 s for 3 s at 720p.
6. Fail with the front view; fixed in part. Wan Animate 2 copies its reference's framing and background and
   ignores the prompt's "Background description". Four runs of the same 8 s dance clip (about 14 minutes each):
   - Front view (a headshot): a smiling close-up of Walt on grey, none of the dance, no jazz club.
   - Full-body view padded white to 16:9: the dance comes through, but in a 9:16 panel between white bars.
   - Full-body view on studio grey (now in `wan-animate.ts`, and Recast sends the full-body view): no bars, but
     Walt is stopped at the panel's edge when he moves sideways, and the set is still the grey studio.
   - Two steps: Qwen draws Walt full body in the jazz club at 16:9 from his full-body view (37 s), and that still
     is the reference. Walt dances across the stage, full body, in the setting, with the clip's sound. Best by far.
     Qwen wrote the prompt's role word ("LEAD") on the back wall as a sign, so the still's prompt should name
     the person by image, not by role.
7. Not judged: the smoke speaks the concert clip's sound (music), and Walt barely moves his mouth to it. Needs a
   recorded spoken line.
8. Open: SeedVR2 sharpens hair, beard and skin texture without changing the face; compare with Freepik's by eye.
9. Pass, with the app's real request (`localAgentRequest`, three seeds): Gemma drafted 4 to 5 shots and
   `shotsFromReply` kept all of them, with valid camera IDs. Seeds 1 and 2 gave the same plan.
10. Pass: all 25 files downloaded and match Hugging Face's sizes.

Fixed from this run:

- Load Video reports the clip it loaded as an output (type `input`), so a local recast returned the visitor's own
  clip as its first asset. `normaliseOutputs` in `lib/router/local.ts` now drops input files as it drops previews.
- `npm run local:models` lost 4 of the 25 files to dropped connections on the first try (Hugging Face drops long
  downloads) and started each over. It now resumes the `.part` with a Range request, retries up to 10 times, checks
  the size before renaming, and refuses a portable build's top folder.
- Local Recast sends the performer's full-body view (`buildCast`'s `view` option) and puts it whole on studio
  grey the shape of the clip, instead of center-cropping the front view.

- Local Recast runs in two steps (Decisions, October 22, item 6, added October 23): a Qwen still of the performer
  in the clip's first frame and the preset's setting (`lib/studio/recast-stage.ts`), then Wan Animate on that
  still. The second job starts from `afterRecast` once the still is saved, guarded against done firing twice.

Run through the app (`npm run dev`, Tour's Walt, the sample clip, Concert stage), October 23: the still took about
40 s (likeness 85), Wan Animate started on its own as the still's child and took 850 s. Walt dances the clip's moves
full body across a concert stage with crowd lights and haze, with the clip's sound, in one card. Exactly one Wan
Animate job ran.

Still open:

- The still follows the setting but only loosely the first frame's position and pose (the dancer stood left of
  centre mid-step; Walt stands right of centre). Wan Animate takes the motion from the clip either way.
- The clip gets no likeness score: at 848×480 a full-body face is under the scorer's 80 px minimum in every frame,
  so each is skipped. The still's score is the only one. Showing it on the final card would help.
- Stunt double asks for "practical stunt clothing" in its motion prompt, but the still keeps the performer's
  clothes and Wan Animate copies the still, so the outfit doesn't change locally.
- A script error (a `TypeError`) reaches the visitor as "Couldn't reach Comfy", which sends them to check a
  connection that's fine.

## Add a line without text-to-speech

ComfyUI has no native text-to-speech node, so a visitor with only their GPU records the line for "Add a line"
themselves. The other options were a TTS custom node (an extra install for every local user) or a small TTS model
such as Kokoro in the browser (about 90 MB of weights the page would host). Marzuwq kept the recording, October 22.

## App checks on the 4090 (October 23)

Every local feature run through its own screen with `npm run dev`, no Comfy key, and a designed character (Samir
Haddad, drawn locally from a description) beside the Tour's Walt.

| Area | Result |
| --- | --- |
| Design from a description | Pass (question 4). Four faces in about 40 s, all usable but much alike. The sheet and views keep the likeness: composite 100, front 100, three-quarter 95, profile 83, full body 100. `sheet.model` records `local/qwen-image-edit-2511`. |
| Image studio | Pass. Two 2K Best stills (1152×1456, question 3) in 15 to 19 s, likeness 86 and 97; an edit of a take kept Samir. Automatic retry under 60 and the 3-image block weren't triggered. |
| Make it real | Works: 10 s, 1822×2302, before/after slider, re-scored. SeedVR2 sharpens rather than adding skin texture like Freepik's (question 8, for Marzuwq to judge). |
| Video | Pass. A 5 s 5B draft (1248×704, 169 s, likeness 85) and its 14B final (1280×720, 181 s, likeness 100; question 5). "Use references" is blocked with "needs Comfy credits". Fixed: a preset longer than the model allows (Night walk's 6 s on Wan) showed its own length until the model changed; `startVideo` already clamped what was sent. |
| Add a line | Runs from an uploaded recording: 4.9 s at 848×480 in 63 s, with sound. The mouth moves but slightly; sync needs watching with sound (question 7). |
| Director | Pass. Gemma planned 5 shots in 24 s with valid camera fields (question 9 in the app); stills and a 5B take ran; one-take shows "Needs Comfy credits". The scene wasn't exported. |
| Recast | Pass (two steps, above). |
| Settings and pickers | Every model ready; one default per feature. A hidden file shows "(not ready)" with its download link, and Make it real is disabled with "Missing on your ComfyUI: {file}" (as a tooltip only). |
| Errors | Cancel interrupts the ComfyUI run. A stopped ComfyUI, or one started without the CORS flag, gives "Couldn't reach your ComfyUI" in Settings. A restart mid-job fails it with `local_lost` and a Retry in the footer. |
| Library and export | Local models named and filterable; Export 9:16 works on a local clip. |
| Built site | `npm run build` and `npm run preview`: the CSP allows loopback ComfyUI, the card connects and an image runs with no CSP error. |

Found, and fixed the same day (each checked in the app or by a test):

- Readiness was checked only at start and from Settings, so once ComfyUI had been down every screen kept saying
  "isn't reachable" after it was back. It's now checked when the tab comes back into view, every 15 s while
  unreachable and every minute while fine: in the app it noticed a stopped ComfyUI in about 75 s and a restarted
  one in under 35 s, with no click (both with the pane hidden, where the browser slows timers).
- A running job read "Generating" while ComfyUI was down. Its Activity frame now reads "Waiting for your ComfyUI"
  (seen about 85 s after a stop), and a restart still ends it with `local_lost` and Retry.
- Local labels that said Router things: Director's final is "Render final on Wan 14B" and its result "Wan 14B
  final · your GPU · may differ from the take"; a SeedVR2 pass reads "Make it real, on your GPU"; a local 14B final
  in Video says it may differ from the draft; Director's Length says when the model fits a shot's length ("Wan 2.2
  5B (fast) on your GPU makes 2 to 5 s clips, so this take runs 5 s"), and the timeline shows a take's own length.
- The full-body view stays "in simple neutral clothing" (spec), so local Recast's still now carries the character's
  description: Samir, beige T-shirt and bare feet without it, wears his green field jacket with it.
- The storage line said "isn't available" while the browser's estimate was still running; it now says it's
  checking until then.
- Each local submit logged a 404: the duplicate check now reads `/api/history/{id}` (`{}` for a new prompt) and
  the queue instead of `/api/jobs/{id}`. No 404 on a submit in the app.

Still open: with the description, Qwen framed Samir from the thighs up rather than head to feet, so a recast
could lose the feet; Stunt double's "practical stunt clothing" still doesn't reach the local still.

Not run: characters from photos (needs a webcam check of the person in them).

## The rest of the app checks (October 24)

- **Automatic retry.** Walt with "seen only from directly behind, never his face": the take scored 0 (no face),
  one retry started on its own with a new seed ("Automatic retry" on the take), scored 0 too, and no third run.
  Locally the retry can't add the front view as an extra reference, since a local run already sends only it.
- **3-image block.** Walt plus a prop and a location (elements made locally from one photo each) is 3 images and
  runs; adding a source image disables Generate with "Qwen on your GPU takes 3 images: the source and 2 cast
  members at most."
- **Director, continue and export.** Two shots on Wan 5B, the second starting from the first's last frame: shot
  2 read "Starts as soon as shot 1's take is done", started on its own when it was (169 s, then 122 s), and its
  first frame is shot 1's last (the same frame; the takes came out 1248 and 1280 wide). Export scene joined them
  with 6-frame crossfades in 12 s: "Export 1 · 9 s · crossfades". Fixed on the way: the open scene kept showing
  shot 2 as "Waiting", with Export disabled, until a reload; it now follows the stored scene.
- **GitHub Pages against a loopback ComfyUI: works.** With ComfyUI on the 4090 started for
  `https://marzuwqlion.github.io`, Marzuwq opened the live site in Chrome on that desktop, allowed Chrome's
  local network prompt, and Settings read "Connected to ComfyUI 0.42.1 on NVIDIA GeForce RTX 4090"; an image on
  Qwen-Image-Edit 2511 ("Free · your GPU") came back. Before the prompt is allowed, every request to `127.0.0.1`
  fails at once and Settings says it couldn't reach ComfyUI, so the setup guide now says to allow it and press
  Check again. Chrome 152 has two permissions here, "local network access" and "loopback network"; neither is
  granted to a tab driven by Claude in Chrome (they stay at "prompt" and never show one), and the app's built-in
  browser denies them outright (`ERR_BLOCKED_BY_CLIENT`), so this check needs a person's own Chrome.

## A key and a ComfyUI together (October 24)

`npm run smoke` passed against the deployed `main` (89 s: catalog, estimate, a Nano Banana image, a Seedance
draft through the Worker, a resumed job). Then, in the dev app with the 4090's ComfyUI and a Comfy key, no
generation spent:

- Settings: every feature lists its local model ("· your GPU") and its Router one ("· Comfy credits").
- Automatic with a key picks Router: Nano Banana for Image and Character design ("≈ $0.08"), H3 and HappyHorse
  for Recast, Claude for Director's plans ("≈ $0.03"), and Kling's one-take is offered. A saved default wins
  (Video and Director kept Wan 5B).
- Pickers group "On your GPU, free" and "Comfy credits" on Image, Video, Recast, Character design and all three
  of Director's.
- A default set in Settings (Image on Qwen) is what the screen picks ("Free · your GPU"), and a pick on the
  screen (Nano Banana) becomes the saved default.
- Never spend credits leaves only local models in Settings and every picker (a single model hides the picker),
  prices Image "Free · your GPU", drafts Director's shots with Gemma, and puts one-take back to "Needs Comfy
  credits."; turning it off brings the Router models back.
