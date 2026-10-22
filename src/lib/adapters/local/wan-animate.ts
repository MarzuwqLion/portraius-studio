// Wan Animate 2 on the visitor's ComfyUI (spec: Local engine, Models): the
// Recast performer drawn into a clip's motion, the background from the
// prompt, the clip's own sound kept. Wired as Comfy's
// video_wan_animate_2_distilled template: the raw frames drive the motion (no
// pose extraction), the performer's front view sets who it is. A clip longer
// than one 81-frame window runs in context windows, with the template's own
// settings, instead of copied subgraphs.
import type { AdapterImpl } from "@/lib/registry/capabilities";
import type { AnimateInput } from "@/lib/registry/inputs";
import type { LocalBody, LocalResult } from "@/lib/registry/local-body";
import { FILES } from "@/lib/registry/local-models";
import { LocalGraph, WAN_NEGATIVE, clip, frameSize, loadImage, loadVideo, localAssets, out, saveVideo, seedOf, text, unet, vae, type Link } from "./graph";

export const ANIMATE_DURATION: [number, number] = [2, 10];

// One window is 81 frames; the clip's frame rate decides how long that is.
const WINDOW_SEC = 2.6;

export const wanAnimate: AdapterImpl<AnimateInput, LocalResult> = {
  capabilities: ["video.edit"],
  delivery: "queue",
  limits: { durationSec: ANIMATE_DURATION, resolutions: ["480p"] },

  buildBody(input): LocalBody {
    const [min, max] = ANIMATE_DURATION;
    if (input.durationSec < min || input.durationSec > max) throw new RangeError(`Wan Animate on your ComfyUI takes clips of ${min} to ${max} seconds.`);
    const g = new LocalGraph();
    let model: Link = out(unet(g, FILES.wanAnimate));
    if (input.durationSec > WINDOW_SEC) {
      model = out(
        g.add("ContextWindowsManual", {
          model,
          context_length: 21,
          context_overlap: 8,
          context_schedule: "standard_static",
          context_stride: 1,
          closed_loop: false,
          fuse_method: "pyramid",
          dim: 2,
          freenoise: true,
          cond_retain_index_list: "0",
          split_conds_to_windows: false,
          latent_retain_index_list: "",
          causal_window_fix: true,
        }),
      );
    }
    const cached = g.add("WanAnimate2Cache", { model, device: "gpu", dtype: "int8" });
    const sampling = g.add("ModelSamplingSD3", { model: out(cached), shift: 5 });
    const sigmas = g.add("BasicScheduler", { model: out(cached), scheduler: "simple", steps: 10, denoise: 1 });
    const sampler = g.add("KSamplerSelect", { sampler_name: "lcm" });

    const encoder = clip(g, FILES.umt5, "wan");
    const decoder = vae(g, FILES.wanAnimateVae);
    const vision = g.add("CLIPVisionLoader", { clip_name: FILES.clipVisionH.name });
    const [width, height] = frameSize(input.aspect, 0.39, 16);
    const resize = (image: Link) =>
      out(g.add("ResizeImageMaskNode", { input: image, resize_type: "scale dimensions", "resize_type.width": width, "resize_type.height": height, "resize_type.crop": "center", scale_method: "area" }));

    const performer = resize(out(loadImage(g, input.performer)));
    const video = g.add("GetVideoComponents", { video: out(loadVideo(g, input.clip)) });
    const frames = resize(out(video, 0));
    const firstFrame = g.add("ImageFromBatch", { image: frames, batch_index: 0, length: 1 });
    const count = g.add("GetImageSize", { image: frames });
    // Video models take 4n + 1 frames.
    const length = g.add("ComfyMathExpression", { expression: "floor((a - 1) / 4) * 4 + 1", "values.a": out(count, 2) });

    const animate = g.add("WanAnimate2ToVideo", {
      positive: out(text(g, encoder, input.prompt)),
      negative: out(text(g, encoder, WAN_NEGATIVE)),
      vae: out(decoder),
      width,
      height,
      length: out(length, 1),
      batch_size: 1,
      video_frame_offset: 0,
      pose_strength: 1,
      pose_start_percent: 0,
      pose_end_percent: 1,
      reference_image_strength: 1,
      reference_image: performer,
      pose_video: frames,
      clip_vision_output: out(g.add("CLIPVisionEncode", { clip_vision: out(vision), image: performer, crop: "none" })),
      positive_pose: out(text(g, encoder, input.motion)),
      clip_vision_output_pose: out(g.add("CLIPVisionEncode", { clip_vision: out(vision), image: out(firstFrame), crop: "none" })),
    });
    const sampled = g.add("SamplerCustom", {
      model: out(sampling),
      add_noise: true,
      noise_seed: seedOf(input.seed),
      cfg: 1,
      positive: out(animate, 0),
      negative: out(animate, 1),
      sampler: out(sampler),
      sigmas: out(sigmas),
      latent_image: out(animate, 2),
    });
    const trimmed = g.add("TrimVideoLatent", { samples: out(sampled), trim_amount: out(animate, 3) });
    const decoded = g.add("VAEDecode", { samples: out(trimmed), vae: out(decoder) });
    saveVideo(g, out(decoded), out(video, 2), "recast", out(video, 1));
    return g.body();
  },

  extractAssets: (raw) => localAssets(raw, "video"),
};
