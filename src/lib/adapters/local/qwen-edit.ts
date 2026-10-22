// Qwen-Image-Edit-2511 on the visitor's ComfyUI (spec: Local engine, Models):
// sheets, stills and edits. Wired as Comfy's image_qwen_image_edit_2511
// template: the fp8 model through ModelSamplingAuraFlow and CFGNorm, a
// Lightning LoRA (4 steps for Fast, 8 for Best) and up to three images
// through TextEncodeQwenImageEditPlus. The prompt compiler's "image 1, image
// 2" legend is how Qwen names its images too.
import type { AdapterImpl } from "@/lib/registry/capabilities";
import type { GenerateImageInput } from "@/lib/registry/inputs";
import type { LocalBody, LocalResult } from "@/lib/registry/local-body";
import { FILES } from "@/lib/registry/local-models";
import { LocalGraph, clip, frameSize, localAssets, lora, out, ratioValue, saveImage, unet, vae, type Link } from "./graph";

// TextEncodeQwenImageEditPlus has three image inputs; an edit's source is one.
export const QWEN_MAX_IMAGES = 3;

// About a megapixel at 1K, more for the bigger sizes; the model's own sizes
// top out near 1.8.
const MEGAPIXELS: Record<GenerateImageInput["size"], number> = { "1K": 1, "2K": 1.6, "4K": 1.6 };

export const qwenEdit: AdapterImpl<GenerateImageInput, LocalResult> = {
  capabilities: ["character.sheet", "image.generate", "image.edit"],
  delivery: "queue",
  limits: { maxRefImages: QWEN_MAX_IMAGES, resolutions: ["1K", "2K"] },

  buildBody(input): LocalBody {
    const images = [...(input.source ? [input.source] : []), ...input.references];
    if (images.length > QWEN_MAX_IMAGES) throw new RangeError(`Qwen on your ComfyUI takes ${QWEN_MAX_IMAGES} images at most; this asks for ${images.length}.`);

    const g = new LocalGraph();
    const fast = input.quality === "fast";
    const model = unet(g, FILES.qwenEdit);
    const shifted = g.add("ModelSamplingAuraFlow", { model: out(model), shift: 3.1 });
    const normed = g.add("CFGNorm", { model: out(shifted), strength: 1 });
    const lightning = lora(g, out(normed), fast ? FILES.qwenLightning4 : FILES.qwenLightning8);
    const encoder = clip(g, FILES.qwenEncoder, "qwen_image");
    const decoder = vae(g, FILES.qwenVae);

    const loaded = images.map((image) => g.add("LoadImage", { image: g.file(image, image.mime) }));
    // The first image is scaled the way the template scales its edit target.
    const imageLinks: Link[] = loaded.map((node, i) => (i === 0 ? out(g.add("FluxKontextImageScale", { image: out(node) })) : out(node)));
    const slots = Object.fromEntries(imageLinks.map((link, i) => [`image${i + 1}`, link]));
    const encode = (prompt: string) => {
      const conditioning = g.add("TextEncodeQwenImageEditPlus", { clip: out(encoder), prompt, vae: out(decoder), ...slots });
      return g.add("FluxKontextMultiReferenceLatentMethod", { conditioning: out(conditioning), reference_latents_method: "index_timestep_zero" });
    };
    const positive = encode(input.prompt);
    const negative = encode("");

    // An edit keeps its source's frame; anything else gets the asked shape.
    let latent: string;
    if (input.source) {
      latent = g.add("VAEEncode", { pixels: imageLinks[0]!, vae: out(decoder) });
    } else {
      const [width, height] = frameSize(ratioValue(input.aspectRatio), MEGAPIXELS[input.size], 16);
      latent = g.add("EmptySD3LatentImage", { width, height, batch_size: 1 });
    }
    const sampled = g.add("KSampler", {
      model: out(lightning),
      seed: input.seed ?? 0,
      steps: fast ? 4 : 8,
      cfg: 1,
      sampler_name: "euler",
      scheduler: "simple",
      positive: out(positive),
      negative: out(negative),
      latent_image: out(latent),
      denoise: 1,
    });
    const decoded = g.add("VAEDecode", { samples: out(sampled), vae: out(decoder) });
    saveImage(g, out(decoded), "qwen");
    return g.body();
  },

  extractAssets: (raw) => localAssets(raw, "image"),
};
