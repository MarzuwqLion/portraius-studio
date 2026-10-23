# Run Portraius Studio on your own GPU

Portraius Studio can run its models on a ComfyUI you start yourself, for free: Qwen-Image-Edit for characters and
images, Wan 2.2 for video, Wan Animate 2 for Recast, Wan 2.2 S2V for speaking clips, SeedVR2 for Make it real and
Gemma 4 for the Director's shot plans. Every model is open weights under Apache 2.0, and every node is built into
ComfyUI, so there's no custom node pack to install. Nothing you make leaves your computer.

You can use it with or without a Comfy API key. With both, each model picker lists what runs on your GPU and what
runs on Comfy credits, and Settings keeps a default for each feature.

## What you need

- An NVIDIA GPU with 24 GB of VRAM (tested target: RTX 4090) and 64 GB of system RAM. ComfyUI moves the parts of a
  model that don't fit on the GPU into RAM, so less VRAM works for images but makes video slow.
- About 170 GB of disk for every model, or less for only the ones you want (the table below has sizes).
- A current ComfyUI: October 2026 or newer. Wan Animate 2, Gemma 4's Generate Text node and the jobs API the app
  uses are recent.

## 1. Install or update ComfyUI

Any of these works:

- **ComfyUI Desktop**: install it from [comfy.org](https://www.comfy.org/download) and let it update.
- **Portable (Windows)**: unzip the latest NVIDIA portable build (`ComfyUI_windows_portable_nvidia.7z` from
  [ComfyUI's releases](https://github.com/Comfy-Org/ComfyUI/releases); v0.42.1 of October 19 has every node). To
  update an older one, run `update/update_comfyui.bat`. If your ComfyUI has many custom nodes, a fresh unzip in a
  new folder is the easier path: the app needs none of them, and an update can break some.
- **From git**: `git pull` in your ComfyUI folder, then `pip install -r requirements.txt` in its Python
  environment, with a CUDA build of PyTorch.

## 2. Download the models

From a clone of this repo:

```
npm install
npm run local:models -- "D:\ComfyUI"
```

Use the folder that has `models/` in it. For Windows portable that's the `ComfyUI` folder inside
`ComfyUI_windows_portable`, for example `"D:\ComfyUI_windows_portable\ComfyUI"`. It downloads every file into the
right `models/` subfolder and skips files you already have. Hugging Face often drops long downloads; the command
picks a dropped file up where it stopped and tries again, and if it still gives up, running it again resumes. To get
only some models, add words from their IDs:

```
npm run local:models -- "D:\ComfyUI" qwen wan2.2-14b
```

Or download them by hand from the links below into the folders shown. Several Wan models share the text encoder
and VAE; you need each file once.

### Qwen-Image-Edit 2511: character sheets, faces, stills and edits (about 32 GB)

| Folder | File | Size |
| --- | --- | --- |
| `models/diffusion_models/` | [qwen_image_edit_2511_fp8mixed.safetensors](https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_edit_2511_fp8mixed.safetensors) | 20.5 GB |
| `models/text_encoders/` | [qwen_2.5_vl_7b_fp8_scaled.safetensors](https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors) | 9.4 GB |
| `models/vae/` | [qwen_image_vae.safetensors](https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors) | 0.3 GB |
| `models/loras/` | [Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors](https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning/resolve/main/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors) | 0.9 GB |
| `models/loras/` | [Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors](https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning/resolve/main/Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors) | 0.9 GB |

### Wan 2.2 5B (fast): video drafts (about 18 GB)

| Folder | File | Size |
| --- | --- | --- |
| `models/diffusion_models/` | [wan2.2_ti2v_5B_fp16.safetensors](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors) | 10 GB |
| `models/text_encoders/` | [umt5_xxl_fp8_e4m3fn_scaled.safetensors](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors) | 6.7 GB |
| `models/vae/` | [wan2.2_vae.safetensors](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan2.2_vae.safetensors) | 1.4 GB |

### Wan 2.2 14B: video from text, a first frame, or a first and last frame (about 69 GB)

| Folder | File | Size |
| --- | --- | --- |
| `models/diffusion_models/` | [wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors) | 14.3 GB |
| `models/diffusion_models/` | [wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors) | 14.3 GB |
| `models/diffusion_models/` | [wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors) | 14.3 GB |
| `models/diffusion_models/` | [wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors) | 14.3 GB |
| `models/loras/` | [wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/loras/wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors) | 1.2 GB |
| `models/loras/` | [wan2.2_t2v_lightx2v_4steps_lora_v1.1_low_noise.safetensors](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/loras/wan2.2_t2v_lightx2v_4steps_lora_v1.1_low_noise.safetensors) | 1.2 GB |
| `models/loras/` | [wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/loras/wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors) | 1.2 GB |
| `models/loras/` | [wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/loras/wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors) | 1.2 GB |
| `models/text_encoders/` | umt5_xxl_fp8_e4m3fn_scaled.safetensors (above) | |
| `models/vae/` | [wan_2.1_vae.safetensors](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors) | 0.3 GB |

### Wan Animate 2: Recast's motion transfer (about 18 GB more)

Recast also uses Qwen-Image-Edit 2511 (above) to draw the performer into the clip's first frame first, so get both.
`npm run local:models -- "D:\ComfyUI" animate` downloads both.

| Folder | File | Size |
| --- | --- | --- |
| `models/diffusion_models/` | [wan_animate_2_distill_int8_convrot.safetensors](https://huggingface.co/Comfy-Org/Wan-Animate-2/resolve/main/diffusion_models/wan_animate_2_distill_int8_convrot.safetensors) | 16.7 GB |
| `models/clip_vision/` | [clip_vision_h.safetensors](https://huggingface.co/Comfy-Org/Wan-Animate-2/resolve/main/clip_vision/clip_vision_h.safetensors) | 1.3 GB |
| `models/vae/` | [Wan2_1_VAE_bf16.safetensors](https://huggingface.co/Comfy-Org/Wan-Animate-2/resolve/main/vae/Wan2_1_VAE_bf16.safetensors) | 0.3 GB |
| `models/text_encoders/` | umt5_xxl_fp8_e4m3fn_scaled.safetensors (above) | |

### Wan 2.2 S2V: speaking clips for Add a line (about 17 GB more)

| Folder | File | Size |
| --- | --- | --- |
| `models/diffusion_models/` | [wan2.2_s2v_14B_fp8_scaled.safetensors](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_s2v_14B_fp8_scaled.safetensors) | 16.4 GB |
| `models/audio_encoders/` | [wav2vec2_large_english_fp16.safetensors](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/audio_encoders/wav2vec2_large_english_fp16.safetensors) | 0.6 GB |
| `models/text_encoders/`, `models/vae/`, `models/loras/` | umt5, wan_2.1_vae and the T2V high-noise LoRA (above) | |

### SeedVR2 7B: Make it real (about 9 GB)

| Folder | File | Size |
| --- | --- | --- |
| `models/diffusion_models/` | [seedvr2_7b_int8_convrot.safetensors](https://huggingface.co/Comfy-Org/SeedVR2/resolve/main/diffusion_models/seedvr2_7b_int8_convrot.safetensors) | 8.3 GB |
| `models/vae/` | [seedvr2_ema_vae_fp16.safetensors](https://huggingface.co/Comfy-Org/SeedVR2/resolve/main/vae/seedvr2_ema_vae_fp16.safetensors) | 0.5 GB |

### Gemma 4 12B: Director's "Draft shots with AI" (about 12 GB)

| Folder | File | Size |
| --- | --- | --- |
| `models/text_encoders/` | [gemma4_12b_int8_convrot.safetensors](https://huggingface.co/Comfy-Org/gemma-4/resolve/main/text_encoders/gemma4_12b_int8_convrot.safetensors) | 12.1 GB |

## 3. Start ComfyUI so the app can reach it

ComfyUI refuses calls from other web pages unless you allow the page's address. Start it with
`--enable-cors-header` and the address you open Portraius Studio from:

| You open the app at | Start ComfyUI with |
| --- | --- |
| [marzuwqlion.github.io/portraius-studio](https://marzuwqlion.github.io/portraius-studio/) | `--enable-cors-header https://marzuwqlion.github.io` |
| `npm run dev` on this computer | `--enable-cors-header http://localhost:5173` |
| `npm run preview` | `--enable-cors-header http://localhost:4173` |

For example, from the ComfyUI folder: `python main.py --enable-cors-header https://marzuwqlion.github.io`.
On Windows portable, open `run_nvidia_gpu.bat` in a text editor (or a copy of it) and add the flag to the end of
the `python_embeded\python.exe ... --windows-standalone-build` line, then start ComfyUI with that file.
ComfyUI Desktop has the same CORS header option in its server settings.

The hosted site can only reach a ComfyUI on the same computer (`127.0.0.1` or `localhost`): browsers let an https
page call plain http on its own machine, and nowhere else. For a ComfyUI on another computer, run the app locally
with `npm run dev` and start ComfyUI with `--listen` as well. Chrome may ask once whether the page can reach
devices on your local network: allow it.

## 4. Point the app at it

In the app, open **Settings**, tick **Use my ComfyUI**, check the address (`http://127.0.0.1:8188` by default) and
press **Check again**. The card shows your GPU and lists any model files still missing, with their links. Once a
model is ready, its picker shows it under "On your GPU, free". With no Comfy key, only your GPU's models are
listed. **Never spend credits** hides Comfy's models even with a key saved.

## Check it from the command line

With ComfyUI running, from a clone of this repo:

```
npm run local:check     # every graph against your ComfyUI's node definitions; free, nothing runs
npm run local:smoke     # every feature once on your GPU; results in .local-smoke/
npm run local:smoke -- qwen      # only the Qwen samples
```

Both read `OBJECT_INFO_URL` or `LOCAL_COMFY_URL` if your ComfyUI isn't at `http://127.0.0.1:8188`. The smoke run
uses the Tour's designed character and sample clips, prints how long each step took, and saves the stills, clips
and plans so you can look at them. It doesn't score likeness or design a face from text, so check those in the app
(`npm run dev`): a character made from photos shows an identity score on each view, and "Design from a
description" draws candidate faces from text.

## What runs where

| Feature | On your GPU | Notes |
| --- | --- | --- |
| Character sheets, design from text | Qwen-Image-Edit 2511 | Takes 3 images: the first 3 good photos for the sheet, 2 plus the sheet for each view. |
| Image studio | Qwen-Image-Edit 2511 | One image per cast member (a person's front view, an element's sheet), 3 in all with an edit's source. |
| Video studio | Wan 2.2 14B, or 5B for fast drafts | 2 to 5 s. A 5B draft's "Render final" draws it again on 14B with the same seed, so it can differ. People aren't sent to MiniMax H3. "Use references" needs Comfy. |
| Recast | Qwen-Image-Edit 2511, then Wan Animate 2 | Motion transfer only, 2 to 10 s clips, in two steps: Qwen draws the performer into the clip's first frame, in the preset's setting, then Wan Animate moves them through the clip and keeps its sound. Object swap and Style swap need Comfy. |
| Make it real | SeedVR2 7B | A restore to about 4 megapixels; no strength slider. |
| Add a line | Wan 2.2 S2V | A speaking clip from the clip's first frame and your recorded line. ComfyUI has no text-to-speech, so stock voices and lip sync need Comfy. |
| Director | Qwen for stills, Wan for takes, Gemma 4 for plans | Kling's one-take needs Comfy. |

Identity scores, automatic retries, the library, remix links and character files all work the same either way.
A character file records which model drew its sheet.

## When something goes wrong

- **"Couldn't reach your ComfyUI"**: it isn't running, the address is wrong, or it was started without
  `--enable-cors-header` for this page's address.
- **"Your ComfyUI is missing ..."**: a model file isn't in its folder. Settings lists it with its link.
- **"Your ComfyUI doesn't have the ... node"**: ComfyUI is older than the models need. Update it.
- **"Your GPU ran out of memory"**: try a shorter clip, Fast, or Wan 5B. Closing other GPU programs helps.
- **"Your ComfyUI restarted before this finished"**: ComfyUI keeps its job list in memory. Retry the job.
