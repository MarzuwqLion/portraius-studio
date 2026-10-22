// What a local adapter builds and what the local backend returns (spec: Local
// engine, Rules 3 and 4). Adapters stay network-free: files ride along as
// uploads, and lib/router/local.ts puts them in ComfyUI's input folder at
// submit, before it queues the prompt.

// A ComfyUI Workflow (API) prompt: node ID -> node. A link is [node ID, output].
export type LocalValue = string | number | boolean | [string, number];
export type LocalPrompt = Record<string, { class_type: string; inputs: Record<string, LocalValue | Record<string, unknown>>; _meta?: { title: string } }>;

export interface LocalUpload {
  name: string;   // the file name in ComfyUI's input folder, which the prompt's loaders name
  mime: string;
  data: string;   // base64, or a data URI
}

export interface LocalBody {
  prompt: LocalPrompt;
  uploads: LocalUpload[];
}

// A file already in the visitor's ComfyUI input folder, from client.uploadLocalInput().
export const LOCAL_INPUT = "local-input:";

export interface LocalFile {
  filename: string;
  subfolder: string;
  type: string;
  url: string;    // /api/view on the visitor's ComfyUI
}

// A finished local job: each output node's files and text.
export interface LocalResult {
  outputs: Record<string, { files: LocalFile[]; text: string[] }>;
}

export function isLocalBody(body: unknown): body is LocalBody {
  return Boolean(body && typeof body === "object" && "prompt" in body && "uploads" in body);
}
