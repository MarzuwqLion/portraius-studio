// Spoken lines: their length, read by the browser from the file itself.
export async function audioDuration(blob: Blob): Promise<number> {
  const url = URL.createObjectURL(blob);
  try {
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.src = url;
    await new Promise<void>((resolve, reject) => {
      audio.onloadedmetadata = () => resolve();
      audio.onerror = () => reject(new Error("This audio can't be played in the browser. Try an MP3 or WAV."));
    });
    return audio.duration;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const LINE_TYPES = ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/wave"] as const;
