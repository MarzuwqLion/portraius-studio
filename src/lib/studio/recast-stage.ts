// The first step of a local recast (spec: Local engine): Qwen draws the
// performer into the clip's first frame, in the preset's setting, and Wan
// Animate 2 then moves that still through the clip. Wan Animate copies its
// reference's framing and background and ignores the prompt's (4090 run,
// October 23), so the still is the set. Kept apart from recast.ts so the
// local samples and scripts can build it.
import type { GenerateImageInput, ImageAspectRatio, InlineImage } from "@/lib/registry/inputs";

// The performer comes from their full-body view, placed and posed like the
// person in the first frame, since Wan Animate keeps the still's framing. Qwen
// is told who is who by image number, never by role: given "LEAD", it wrote
// LEAD on the wall as a sign.
// A sheet's full-body view is drawn "in simple neutral clothing" (spec:
// Character vault), so the character's description, which carries a usual
// outfit, dresses them (4090 app checks, October 23: Samir lost his jacket).
export function stagePrompt(setting: string | undefined, direction: string, description?: string): string {
  const about = description?.trim();
  return [
    "Image 1 is a full-body portrait of a person. Image 2 is the first frame of a video.",
    "Draw the person from image 1, with exactly the same face, hair, skin and build, in place of the person in image 2: in the same position, at the same size in the frame and in the same pose.",
    about ? `About them: ${about.replace(/\.?$/, ".")} Dress them as described there; anything it leaves out comes from image 1.` : "Keep the clothes from image 1.",
    setting ? `The place is ${setting}, seen from the same camera position as image 2.` : "Keep the place, the light and the camera of image 2.",
    "Nobody else is in the picture. No text, signs or lettering.",
    direction.trim(),
  ]
    .filter(Boolean)
    .join(" ");
}

export function stageStillInput(
  performer: InlineImage,
  frame: InlineImage,
  options: { setting: string | undefined; direction: string; description?: string; aspectRatio: ImageAspectRatio; seed: number },
): GenerateImageInput {
  return {
    prompt: stagePrompt(options.setting, options.direction, options.description),
    references: [performer, frame],
    aspectRatio: options.aspectRatio,
    size: "1K",
    quality: "fast",
    seed: options.seed,
  };
}
