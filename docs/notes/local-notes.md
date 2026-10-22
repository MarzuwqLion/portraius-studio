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

## Open question for Marzuwq

ComfyUI has no native text-to-speech node, so a visitor with only their GPU records the line for "Add a line"
themselves. Options: keep it that way; add a TTS custom node (an extra install for every local user, which this
build has avoided); or run a small TTS model such as Kokoro in the browser (no install, about 90 MB of weights the
page would host).
