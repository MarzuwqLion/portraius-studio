// The files each local model needs in the visitor's ComfyUI (spec: Local
// engine, Models). Settings checks them with /api/models/{folder}, the graphs
// name them, and docs/local-setup.md lists them. Every file is Apache 2.0.
import { MODEL_IDS } from "./models";

export interface ModelFile {
  folder: "diffusion_models" | "text_encoders" | "vae" | "loras" | "clip_vision" | "audio_encoders";
  name: string;
  url: string;
  gb: number;
}

const HF = "https://huggingface.co";
const WAN22 = `${HF}/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files`;

export const FILES = {
  qwenEdit: { folder: "diffusion_models", name: "qwen_image_edit_2511_fp8mixed.safetensors", url: `${HF}/Comfy-Org/Qwen-Image-Edit_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_edit_2511_fp8mixed.safetensors`, gb: 20.5 },
  qwenEncoder: { folder: "text_encoders", name: "qwen_2.5_vl_7b_fp8_scaled.safetensors", url: `${HF}/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors`, gb: 9.4 },
  qwenVae: { folder: "vae", name: "qwen_image_vae.safetensors", url: `${HF}/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors`, gb: 0.3 },
  qwenLightning4: { folder: "loras", name: "Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors", url: `${HF}/lightx2v/Qwen-Image-Edit-2511-Lightning/resolve/main/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors`, gb: 0.9 },
  qwenLightning8: { folder: "loras", name: "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors", url: `${HF}/lightx2v/Qwen-Image-Edit-2511-Lightning/resolve/main/Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors`, gb: 0.9 },

  umt5: { folder: "text_encoders", name: "umt5_xxl_fp8_e4m3fn_scaled.safetensors", url: `${WAN22}/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors`, gb: 6.7 },
  wan21Vae: { folder: "vae", name: "wan_2.1_vae.safetensors", url: `${WAN22}/vae/wan_2.1_vae.safetensors`, gb: 0.3 },
  wan22Vae: { folder: "vae", name: "wan2.2_vae.safetensors", url: `${WAN22}/vae/wan2.2_vae.safetensors`, gb: 1.4 },
  wan5b: { folder: "diffusion_models", name: "wan2.2_ti2v_5B_fp16.safetensors", url: `${WAN22}/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors`, gb: 10 },
  wanT2vHigh: { folder: "diffusion_models", name: "wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors", url: `${WAN22}/diffusion_models/wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors`, gb: 14.3 },
  wanT2vLow: { folder: "diffusion_models", name: "wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors", url: `${WAN22}/diffusion_models/wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors`, gb: 14.3 },
  wanI2vHigh: { folder: "diffusion_models", name: "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors", url: `${WAN22}/diffusion_models/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors`, gb: 14.3 },
  wanI2vLow: { folder: "diffusion_models", name: "wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors", url: `${WAN22}/diffusion_models/wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors`, gb: 14.3 },
  wanT2vLoraHigh: { folder: "loras", name: "wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors", url: `${WAN22}/loras/wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors`, gb: 1.2 },
  wanT2vLoraLow: { folder: "loras", name: "wan2.2_t2v_lightx2v_4steps_lora_v1.1_low_noise.safetensors", url: `${WAN22}/loras/wan2.2_t2v_lightx2v_4steps_lora_v1.1_low_noise.safetensors`, gb: 1.2 },
  wanI2vLoraHigh: { folder: "loras", name: "wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors", url: `${WAN22}/loras/wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors`, gb: 1.2 },
  wanI2vLoraLow: { folder: "loras", name: "wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors", url: `${WAN22}/loras/wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors`, gb: 1.2 },

  wanAnimate: { folder: "diffusion_models", name: "wan_animate_2_distill_int8_convrot.safetensors", url: `${HF}/Comfy-Org/Wan-Animate-2/resolve/main/diffusion_models/wan_animate_2_distill_int8_convrot.safetensors`, gb: 16.7 },
  clipVisionH: { folder: "clip_vision", name: "clip_vision_h.safetensors", url: `${HF}/Comfy-Org/Wan-Animate-2/resolve/main/clip_vision/clip_vision_h.safetensors`, gb: 1.3 },
  wanAnimateVae: { folder: "vae", name: "Wan2_1_VAE_bf16.safetensors", url: `${HF}/Comfy-Org/Wan-Animate-2/resolve/main/vae/Wan2_1_VAE_bf16.safetensors`, gb: 0.3 },

  wanS2v: { folder: "diffusion_models", name: "wan2.2_s2v_14B_fp8_scaled.safetensors", url: `${WAN22}/diffusion_models/wan2.2_s2v_14B_fp8_scaled.safetensors`, gb: 16.4 },
  wav2vec2: { folder: "audio_encoders", name: "wav2vec2_large_english_fp16.safetensors", url: `${WAN22}/audio_encoders/wav2vec2_large_english_fp16.safetensors`, gb: 0.6 },

  seedvr2: { folder: "diffusion_models", name: "seedvr2_7b_int8_convrot.safetensors", url: `${HF}/Comfy-Org/SeedVR2/resolve/main/diffusion_models/seedvr2_7b_int8_convrot.safetensors`, gb: 8.3 },
  seedvr2Vae: { folder: "vae", name: "seedvr2_ema_vae_fp16.safetensors", url: `${HF}/Comfy-Org/SeedVR2/resolve/main/vae/seedvr2_ema_vae_fp16.safetensors`, gb: 0.5 },

  gemma: { folder: "text_encoders", name: "gemma4_12b_int8_convrot.safetensors", url: `${HF}/Comfy-Org/gemma-4/resolve/main/text_encoders/gemma4_12b_int8_convrot.safetensors`, gb: 12.1 },
} as const satisfies Record<string, ModelFile>;

export const LOCAL_MODEL_FILES: Record<string, readonly ModelFile[]> = {
  [MODEL_IDS.localQwenEdit]: [FILES.qwenEdit, FILES.qwenEncoder, FILES.qwenVae, FILES.qwenLightning4, FILES.qwenLightning8],
  [MODEL_IDS.localWanFast]: [FILES.wan5b, FILES.umt5, FILES.wan22Vae],
  [MODEL_IDS.localWanBest]: [
    FILES.wanT2vHigh, FILES.wanT2vLow, FILES.wanI2vHigh, FILES.wanI2vLow,
    FILES.wanT2vLoraHigh, FILES.wanT2vLoraLow, FILES.wanI2vLoraHigh, FILES.wanI2vLoraLow,
    FILES.umt5, FILES.wan21Vae,
  ],
  // Recast draws the performer into the clip's first frame with Qwen before Wan Animate moves them.
  [MODEL_IDS.localWanAnimate]: [
    FILES.wanAnimate, FILES.umt5, FILES.clipVisionH, FILES.wanAnimateVae,
    FILES.qwenEdit, FILES.qwenEncoder, FILES.qwenVae, FILES.qwenLightning4,
  ],
  [MODEL_IDS.localWanSpeech]: [FILES.wanS2v, FILES.wav2vec2, FILES.umt5, FILES.wan21Vae, FILES.wanT2vLoraHigh],
  [MODEL_IDS.localSeedVR2]: [FILES.seedvr2, FILES.seedvr2Vae],
  [MODEL_IDS.localGemma]: [FILES.gemma],
};

export function localModelFiles(modelId: string): readonly ModelFile[] {
  return LOCAL_MODEL_FILES[modelId] ?? [];
}

// Files a model needs that aren't in the folders a ComfyUI reported.
export function missingFiles(modelId: string, installed: Partial<Record<ModelFile["folder"], readonly string[]>>): ModelFile[] {
  return localModelFiles(modelId).filter((f) => !installed[f.folder]?.includes(f.name));
}

// Every distinct file, for the setup guide and the Settings card.
export function allLocalFiles(): ModelFile[] {
  const seen = new Map<string, ModelFile>();
  for (const files of Object.values(LOCAL_MODEL_FILES)) for (const f of files) seen.set(`${f.folder}/${f.name}`, f);
  return [...seen.values()];
}
