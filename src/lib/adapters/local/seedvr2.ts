// SeedVR2 7B on the visitor's ComfyUI (spec: Local engine, Models): Make it
// real, as a one-step restore to about 4 megapixels. Wired as Comfy's
// utility_seedvr2_7b_int8_upscale_image template, with tiled encode and decode.
import type { AdapterImpl } from "@/lib/registry/capabilities";
import type { EnhanceImageInput } from "@/lib/registry/inputs";
import type { LocalBody, LocalResult } from "@/lib/registry/local-body";
import { FILES } from "@/lib/registry/local-models";
import { LocalGraph, loadImage, localAssets, out, saveImage, unet, vae } from "./graph";

const TILES = { tile_size: 512, overlap: 128, temporal_size: 4096, temporal_overlap: 8 };

export const seedvr2: AdapterImpl<EnhanceImageInput, LocalResult> = {
  capabilities: ["image.enhance"],
  delivery: "queue",
  limits: {},

  buildBody(input): LocalBody {
    if (!input.image.base64) throw new RangeError("The realism pass needs an image.");
    const g = new LocalGraph();
    const model = unet(g, FILES.seedvr2);
    const decoder = vae(g, FILES.seedvr2Vae);
    const resized = g.add("ResizeImageMaskNode", { input: out(loadImage(g, input.image)), resize_type: "scale total pixels", "resize_type.megapixels": 4, scale_method: "lanczos" });
    const prepared = g.add("SeedVR2Preprocess", { resized_images: out(resized) });
    const encoded = g.add("VAEEncodeTiled", { pixels: out(prepared), vae: out(decoder), ...TILES });
    const conditioning = g.add("SeedVR2Conditioning", { model: out(model), vae_conditioning: out(encoded) });
    const sampled = g.add("KSampler", {
      model: out(model),
      seed: 0,
      steps: 1,
      cfg: 1,
      sampler_name: "euler",
      scheduler: "simple",
      positive: out(conditioning, 0),
      negative: out(conditioning, 1),
      latent_image: out(encoded),
      denoise: 1,
    });
    const decoded = g.add("VAEDecodeTiled", { samples: out(sampled), vae: out(decoder), ...TILES });
    const finished = g.add("SeedVR2PostProcessing", { images: out(decoded), original_resized_images: out(resized), color_correction_method: "none" });
    saveImage(g, out(finished), "make-it-real");
    return g.body();
  },

  extractAssets: (raw) => localAssets(raw, "image"),
};
