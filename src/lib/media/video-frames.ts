// Frames out of a saved video, in the browser: the last frame for Continue
// when a final has none (Unknowns row 9), and one frame a second for scoring.
// A video element seeks and a canvas copies the frame; no ffmpeg needed.

export async function openVideo(blob: Blob): Promise<{ video: HTMLVideoElement; close: () => void }> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error("The video couldn't be opened."));
  });
  return { video, close: () => URL.revokeObjectURL(url) };
}

export async function frameAt(video: HTMLVideoElement, seconds: number): Promise<HTMLCanvasElement> {
  const target = Math.min(Math.max(0, seconds), Math.max(0, video.duration - 0.05));
  if (Math.abs(video.currentTime - target) > 0.001) {
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      video.currentTime = target;
    });
  }
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d")!.drawImage(video, 0, 0);
  return canvas;
}

function jpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The frame couldn't be encoded."))), "image/jpeg", 0.92));
}

export async function firstFrame(blob: Blob): Promise<{ jpeg: Blob; width: number; height: number }> {
  const { video, close } = await openVideo(blob);
  try {
    const canvas = await frameAt(video, 0);
    return { jpeg: await jpeg(canvas), width: canvas.width, height: canvas.height };
  } finally {
    close();
  }
}

export async function lastFrame(blob: Blob): Promise<Blob> {
  const { video, close } = await openVideo(blob);
  try {
    return await jpeg(await frameAt(video, video.duration));
  } finally {
    close();
  }
}

// One frame a second, up to `max` (spec: Identity, Video).
export async function sampleFrames(blob: Blob, max = 10): Promise<{ seconds: number; canvas: HTMLCanvasElement }[]> {
  const { video, close } = await openVideo(blob);
  try {
    const count = Math.max(1, Math.min(max, Math.floor(video.duration)));
    const frames: { seconds: number; canvas: HTMLCanvasElement }[] = [];
    for (let i = 0; i < count; i++) {
      const seconds = i + 0.5;
      frames.push({ seconds, canvas: await frameAt(video, seconds) });
    }
    return frames;
  } finally {
    close();
  }
}

export function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return jpeg(canvas);
}
