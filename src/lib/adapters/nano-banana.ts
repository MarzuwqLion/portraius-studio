// Nano Banana 2.1 (spec: Image studio, Request body). Text first, then the
// source image in edit mode, then the references in legend order.
import type { AdapterImpl, AssetRef } from "@/lib/registry/capabilities";
import type { GenerateImageInput } from "@/lib/registry/inputs";
import type { VertexaiGeminiNanoBanana21 as Schema } from "@/lib/registry/schemas";

type NanoBananaBody = Schema.operations["runRouterModel"]["requestBody"]["content"]["application/json"];
export type NanoBananaResult = Schema.components["schemas"]["GeminiGenerateContentResponse"];

export const nanoBanana: AdapterImpl<GenerateImageInput, NanoBananaResult> = {
  capabilities: ["character.sheet", "image.generate", "image.edit"],
  delivery: "queue",
  limits: { maxRefImages: 14, resolutions: ["1K", "2K", "4K"] },

  buildBody(input): NanoBananaBody {
    const images = input.source ? [input.source, ...input.references] : input.references;
    return {
      contents: [
        {
          role: "user",
          parts: [{ text: input.prompt }, ...images.map((image) => ({ inlineData: { mimeType: image.mime, data: image.base64 } }))],
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio: input.aspectRatio, imageSize: input.size },
        thinkingConfig: { thinkingLevel: input.quality === "best" ? "HIGH" : "MINIMAL" },
        ...(input.seed !== undefined ? { seed: input.seed } : {}),
      },
    };
  },

  // Thinking adds draft images marked thought: true ahead of the real one
  // (seen in M1), so those are skipped. A partner may answer with fileData.
  extractAssets(raw) {
    const parts = raw.candidates?.[0]?.content?.parts ?? [];
    const assets: AssetRef[] = [];
    for (const part of parts) {
      if (part.thought) continue;
      if (part.inlineData?.data) {
        assets.push({ kind: "image", base64: part.inlineData.data, ...(part.inlineData.mimeType ? { mime: part.inlineData.mimeType } : {}) });
      } else if (part.fileData?.fileUri) {
        assets.push({ kind: "image", url: part.fileData.fileUri, ...(part.fileData.mimeType ? { mime: part.fileData.mimeType } : {}) });
      }
    }
    return assets;
  },
};
