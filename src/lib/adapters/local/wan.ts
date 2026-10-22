// Wan 2.2 on the visitor's ComfyUI (spec: Local engine, Models). Two models:
// - 5B TI2V, the fast one: text or a first frame, about 1280x704 at 24 fps,
//   20 steps (Comfy's video_wan2_2_5B_ti2v template).
// - 14B, the best one: text (T2V), a first frame (I2V) or a first and last
//   frame, 720p at 16 fps, the high-noise model for the first two of four
//   steps and the low-noise one for the rest, each with its lightx2v 4-step
//   LoRA (Comfy's video_wan2_2_14B_t2v, _i2v and _flf2v templates).
import type { AdapterImpl } from "@/lib/registry/capabilities";
import type { WanInput } from "@/lib/registry/inputs";
import type { LocalBody, LocalResult } from "@/lib/registry/local-body";
import { FILES, type ModelFile } from "@/lib/registry/local-models";
import { LocalGraph, WAN_NEGATIVE, clip, frameCount, frameSize, loadImage, localAssets, lora, out, saveVideo, seedOf, text, unet, vae } from "./graph";

export const WAN_FAST_DURATION: [number, number] = [2, 5];
export const WAN_BEST_DURATION: [number, number] = [2, 5];

function checkDuration(input: WanInput, [min, max]: [number, number]): void {
  if (input.durationSec < min || input.durationSec > max) throw new RangeError(`Wan on your ComfyUI makes clips of ${min} to ${max} seconds.`);
}

export const wanFast: AdapterImpl<WanInput, LocalResult> = {
  capabilities: ["video.generate"],
  delivery: "queue",
  limits: { durationSec: WAN_FAST_DURATION, resolutions: ["720p"] },

  buildBody(input): LocalBody {
    checkDuration(input, WAN_FAST_DURATION);
    if (input.lastFrame) throw new RangeError("The fast Wan model can't end on a frame. Pick Wan 2.2 14B.");
    const fps = 24;
    const g = new LocalGraph();
    const model = g.add("ModelSamplingSD3", { model: out(unet(g, FILES.wan5b)), shift: 8 });
    const encoder = clip(g, FILES.umt5, "wan");
    const decoder = vae(g, FILES.wan22Vae);
    const [width, height] = frameSize(input.aspect, 0.86, 32);
    const latent = g.add("Wan22ImageToVideoLatent", {
      vae: out(decoder),
      width,
      height,
      length: frameCount(input.durationSec, fps),
      batch_size: 1,
      ...(input.firstFrame ? { start_image: out(loadImage(g, input.firstFrame)) } : {}),
    });
    const sampled = g.add("KSampler", {
      model: out(model),
      seed: seedOf(input.seed),
      steps: 20,
      cfg: 5,
      sampler_name: "uni_pc",
      scheduler: "simple",
      positive: out(text(g, encoder, input.prompt)),
      negative: out(text(g, encoder, WAN_NEGATIVE)),
      latent_image: out(latent),
      denoise: 1,
    });
    const frames = g.add("VAEDecode", { samples: out(sampled), vae: out(decoder) });
    saveVideo(g, out(frames), fps, "wan-fast");
    return g.body();
  },

  extractAssets: (raw) => localAssets(raw, "video"),
};

export const wanBest: AdapterImpl<WanInput, LocalResult> = {
  capabilities: ["video.generate"],
  delivery: "queue",
  limits: { durationSec: WAN_BEST_DURATION, resolutions: ["720p"] },

  buildBody(input): LocalBody {
    checkDuration(input, WAN_BEST_DURATION);
    if (input.lastFrame && !input.firstFrame) throw new RangeError("An end frame needs a first frame.");
    const fps = 16;
    const fromImage = Boolean(input.firstFrame);
    const g = new LocalGraph();
    const sampling = (diffusion: ModelFile, loraFile: ModelFile) =>
      g.add("ModelSamplingSD3", { model: out(lora(g, out(unet(g, diffusion)), loraFile)), shift: 5 });
    const high = fromImage ? sampling(FILES.wanI2vHigh, FILES.wanI2vLoraHigh) : sampling(FILES.wanT2vHigh, FILES.wanT2vLoraHigh);
    const low = fromImage ? sampling(FILES.wanI2vLow, FILES.wanI2vLoraLow) : sampling(FILES.wanT2vLow, FILES.wanT2vLoraLow);
    const encoder = clip(g, FILES.umt5, "wan");
    const decoder = vae(g, FILES.wan21Vae);
    const prompt = text(g, encoder, input.prompt);
    const negative = text(g, encoder, WAN_NEGATIVE);
    const [width, height] = frameSize(input.aspect, 0.88, 16);
    const length = frameCount(input.durationSec, fps);

    // Conditioning and latent: from the frames when there are any.
    let positiveLink = out(prompt);
    let negativeLink = out(negative);
    let latentLink;
    if (input.firstFrame) {
      const start = out(loadImage(g, input.firstFrame));
      const node = input.lastFrame
        ? g.add("WanFirstLastFrameToVideo", { positive: out(prompt), negative: out(negative), vae: out(decoder), width, height, length, batch_size: 1, start_image: start, end_image: out(loadImage(g, input.lastFrame)) })
        : g.add("WanImageToVideo", { positive: out(prompt), negative: out(negative), vae: out(decoder), width, height, length, batch_size: 1, start_image: start });
      positiveLink = out(node, 0);
      negativeLink = out(node, 1);
      latentLink = out(node, 2);
    } else {
      latentLink = out(g.add("EmptyHunyuanLatentVideo", { width, height, length, batch_size: 1 }));
    }

    const common = { steps: 4, cfg: 1, sampler_name: "euler", scheduler: "simple", positive: positiveLink, negative: negativeLink };
    const first = g.add("KSamplerAdvanced", { ...common, model: out(high), add_noise: "enable", noise_seed: seedOf(input.seed), latent_image: latentLink, start_at_step: 0, end_at_step: 2, return_with_leftover_noise: "enable" });
    const second = g.add("KSamplerAdvanced", { ...common, model: out(low), add_noise: "disable", noise_seed: 0, latent_image: out(first), start_at_step: 2, end_at_step: 10000, return_with_leftover_noise: "disable" });
    const frames = g.add("VAEDecode", { samples: out(second), vae: out(decoder) });
    saveVideo(g, out(frames), fps, "wan");
    return g.body();
  },

  extractAssets: (raw) => localAssets(raw, "video"),
};
