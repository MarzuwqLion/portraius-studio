// Wan 2.2 S2V on the visitor's ComfyUI (spec: Local engine, Models): a still
// that speaks a line, for "Add a line". Wired as Comfy's video_wan2_2_14B_s2v
// template: 77-frame chunks at 16 fps (about 4.8 s each), the first from the
// still and the line, each next one extending the clip, all with the lightx2v
// 4-step LoRA. The line's audio is the clip's sound.
import type { AdapterImpl } from "@/lib/registry/capabilities";
import type { SpeakInput } from "@/lib/registry/inputs";
import type { LocalBody, LocalResult } from "@/lib/registry/local-body";
import { FILES } from "@/lib/registry/local-models";
import { LocalGraph, WAN_NEGATIVE, clip, frameSize, loadAudio, loadImage, localAssets, lora, out, saveVideo, seedOf, text, unet, vae } from "./graph";

export const SPEECH_DURATION: [number, number] = [1, 15];
const FPS = 16;
const CHUNK = 77;

export const wanSpeech: AdapterImpl<SpeakInput, LocalResult> = {
  capabilities: ["video.lipsync"],
  delivery: "queue",
  limits: { durationSec: SPEECH_DURATION, resolutions: ["480p"] },

  buildBody(input): LocalBody {
    const [min, max] = SPEECH_DURATION;
    if (input.durationSec < min || input.durationSec > max) throw new RangeError(`Wan S2V on your ComfyUI speaks lines of ${min} to ${max} seconds.`);
    const g = new LocalGraph();
    const model = g.add("ModelSamplingSD3", { model: out(lora(g, out(unet(g, FILES.wanS2v)), FILES.wanT2vLoraHigh)), shift: 8 });
    const encoder = clip(g, FILES.umt5, "wan");
    const decoder = vae(g, FILES.wan21Vae);
    const positive = text(g, encoder, input.prompt);
    const negative = text(g, encoder, WAN_NEGATIVE);
    const audio = loadAudio(g, input.audio);
    const heard = g.add("AudioEncoderEncode", { audio_encoder: out(g.add("AudioEncoderLoader", { audio_encoder_name: FILES.wav2vec2.name })), audio: out(audio) });
    const still = loadImage(g, input.image);
    const [width, height] = frameSize(input.aspect, 0.39, 16);
    const sample = (conditioning: string, seed: number) =>
      g.add("KSampler", {
        model: out(model),
        seed,
        steps: 4,
        cfg: 1,
        sampler_name: "uni_pc",
        scheduler: "simple",
        positive: out(conditioning, 0),
        negative: out(conditioning, 1),
        latent_image: out(conditioning, 2),
        denoise: 1,
      });
    const shared = { positive: out(positive), negative: out(negative), vae: out(decoder), audio_encoder_output: out(heard), ref_image: out(still) };
    const seed = seedOf(input.seed);

    const start = g.add("WanSoundImageToVideo", { ...shared, width, height, length: CHUNK, batch_size: 1 });
    let latent = sample(start, seed);
    const chunks = Math.max(1, Math.ceil((input.durationSec * FPS) / CHUNK));
    for (let i = 1; i < chunks; i++) {
      const extend = g.add("WanSoundImageToVideoExtend", { ...shared, length: CHUNK, video_latent: out(latent) });
      latent = g.add("LatentConcat", { samples1: out(latent), samples2: out(sample(extend, seed + i)), dim: "t" });
    }
    // As the template does: the first latent frame again in front, and the
    // first three decoded frames dropped.
    const first = g.add("LatentCut", { samples: out(latent), dim: "t", index: 0, amount: 1 });
    const joined = g.add("LatentConcat", { samples1: out(first), samples2: out(latent), dim: "t" });
    const decoded = g.add("VAEDecode", { samples: out(joined), vae: out(decoder) });
    const trimmed = g.add("ImageFromBatch", { image: out(decoded), batch_index: 3, length: 4096 });
    saveVideo(g, out(trimmed), FPS, "speak", out(audio));
    return g.body();
  },

  extractAssets: (raw) => localAssets(raw, "video"),
};
