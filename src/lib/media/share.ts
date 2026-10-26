// The phone's share sheet for a finished file (contest polish, October 25:
// "made to be shared"), where the browser can share files; elsewhere the
// caller keeps its download.
export const SHARE_TEXT = "Made with Portraius Studio, open source. #OpenSourceHiggsfield";

export function canShareFile(file: File): boolean {
  return typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
}

// Opens the share sheet; closing it without picking an app isn't an error.
export async function shareFile(file: File, text = SHARE_TEXT): Promise<void> {
  try {
    await navigator.share({ files: [file], text });
  } catch (err) {
    if ((err as Error).name !== "AbortError") throw err;
  }
}
