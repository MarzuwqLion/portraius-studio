import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cancel, check, executionError, promptError, result, setLocalUrl, status, submit } from "./local";

const BASE = "http://127.0.0.1:8188";
const ID = "5b1f7a8e-2c4d-4e6f-8a9b-0c1d2e3f4a5b";

// A small fake ComfyUI: the routes local.ts calls, with the shapes the real
// server answers (ComfyUI master, October 2026: server.py and comfy_execution/jobs.py).
interface Fake {
  jobs: Map<string, Record<string, unknown>>;
  uploads: string[];
  prompts: Record<string, unknown>[];
  pending: string[];
  refusal?: Record<string, unknown>;
  down?: boolean;
}

function fakeComfy(fake: Fake) {
  return vi.fn(async (input: string | URL, init: RequestInit = {}) => {
    if (fake.down) throw new TypeError("Failed to fetch");
    const url = new URL(String(input));
    const path = url.pathname;
    const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    let m: RegExpMatchArray | null;
    if ((m = path.match(/^\/api\/jobs\/([^/]+)\/cancel$/))) {
      const job = fake.jobs.get(m[1]!);
      if (job) job.status = "cancelled";
      return reply({ cancelled: Boolean(job) });
    }
    if ((m = path.match(/^\/api\/jobs\/([^/]+)$/))) {
      const job = fake.jobs.get(m[1]!);
      return job ? reply(job) : reply({ error: "Job not found" }, 404);
    }
    if (path === "/api/upload/image") {
      const form = init.body as FormData;
      const file = form.get("image") as File;
      fake.uploads.push(file.name);
      return reply({ name: file.name, subfolder: "", type: "input" });
    }
    if (path === "/api/prompt") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      if (fake.refusal) return reply(fake.refusal, 400);
      fake.prompts.push(body);
      fake.jobs.set(String(body.prompt_id), { id: body.prompt_id, status: "pending" });
      fake.pending.push(String(body.prompt_id));
      return reply({ prompt_id: body.prompt_id, number: fake.prompts.length, node_errors: {} });
    }
    if (path === "/api/queue") {
      return reply({ queue_running: [[0, "someone-else", {}, {}, []]], queue_pending: fake.pending.map((id, i) => [i + 1, id, {}, {}, []]) });
    }
    if (path === "/api/system_stats") {
      return reply({ system: { comfyui_version: "0.9.1" }, devices: [{ name: "cuda:0 NVIDIA GeForce RTX 4090", type: "cuda", vram_total: 25757220864 }] });
    }
    if ((m = path.match(/^\/api\/models\/(.+)$/))) {
      return reply(m[1] === "vae" ? ["qwen_image_vae.safetensors"] : []);
    }
    return reply({}, 404);
  });
}

let fake: Fake;

beforeEach(() => {
  fake = { jobs: new Map(), uploads: [], prompts: [], pending: [] };
  vi.stubGlobal("fetch", fakeComfy(fake));
  setLocalUrl(BASE);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setLocalUrl(undefined);
});

const BODY = {
  prompt: { "1": { class_type: "LoadImage", inputs: { image: "portraius-abc.jpg" } } },
  uploads: [{ name: "portraius-abc.jpg", mime: "image/jpeg", data: "data:image/jpeg;base64,/9j/4AAQ" }],
};

describe("local submit", () => {
  it("uploads the inputs, then queues the prompt under the job's idempotency key", async () => {
    await expect(submit(BODY, { idempotencyKey: ID })).resolves.toEqual({ requestId: ID });
    expect(fake.uploads).toEqual(["portraius-abc.jpg"]);
    expect(fake.prompts).toEqual([{ prompt: BODY.prompt, prompt_id: ID, client_id: "portraius-studio" }]);
  });

  it("never queues a second run for a repeated submit", async () => {
    await submit(BODY, { idempotencyKey: ID });
    await submit(BODY, { idempotencyKey: ID });
    expect(fake.prompts).toHaveLength(1);
  });

  it("names a missing model file", async () => {
    fake.refusal = {
      error: { type: "prompt_outputs_failed_validation", message: "Prompt outputs failed validation", details: "" },
      node_errors: { "2": { class_type: "UNETLoader", errors: [{ type: "value_not_in_list", message: "Value not in list", extra_info: { input_name: "unet_name", received_value: "qwen_image_edit_2511_fp8mixed.safetensors" } }] } },
    };
    await expect(submit(BODY, { idempotencyKey: ID })).rejects.toMatchObject({ code: "local_model_missing", message: expect.stringContaining("qwen_image_edit_2511_fp8mixed.safetensors"), action: "check_local" });
  });

  it("says when the ComfyUI can't be reached", async () => {
    fake.down = true;
    await expect(submit(BODY, { idempotencyKey: ID })).rejects.toMatchObject({ code: "local_unreachable", retry: "manual", action: "check_local" });
  });
});

describe("local status and result", () => {
  it("reports the queue position, then progress, then the files", async () => {
    await submit(BODY, { idempotencyKey: ID });
    // One run ahead of it, nothing else pending before it.
    await expect(status(ID)).resolves.toEqual({ status: "IN_QUEUE", completed: false, queuePosition: 2 });
    fake.jobs.get(ID)!.status = "in_progress";
    await expect(status(ID)).resolves.toMatchObject({ status: "IN_PROGRESS", completed: false });
    fake.jobs.set(ID, {
      id: ID,
      status: "completed",
      outputs: {
        "9": { images: [{ filename: "portraius_00001_.png", subfolder: "portraius", type: "output" }] },
        "10": { images: [{ filename: "preview.png", subfolder: "", type: "temp" }] },
        "11": { text: ["a plan"] },
        "12": { images: [{ filename: "portraius-clip.mp4", subfolder: "", type: "input" }], animated: [true] },
      },
    });
    await expect(status(ID)).resolves.toMatchObject({ status: "COMPLETED", completed: true });
    const res = await result(ID);
    expect(res.outputs["9"]!.files).toEqual([
      { filename: "portraius_00001_.png", subfolder: "portraius", type: "output", url: `${BASE}/api/view?filename=portraius_00001_.png&subfolder=portraius&type=output` },
    ]);
    expect(res.outputs["10"]!.files).toEqual([]);
    expect(res.outputs["11"]!.text).toEqual(["a plan"]);
    expect(res.outputs["12"]!.files).toEqual([]);
  });

  it("fails a job the ComfyUI forgot (it restarted) with local_lost", async () => {
    await expect(status(ID)).resolves.toMatchObject({ completed: true });
    await expect(result(ID)).rejects.toMatchObject({ code: "local_lost", retry: "manual" });
  });

  it("maps a failed run and a cancelled one", async () => {
    fake.jobs.set(ID, { id: ID, status: "failed", execution_error: { node_type: "KSampler", exception_type: "torch.OutOfMemoryError", exception_message: "CUDA out of memory." } });
    await expect(result(ID)).rejects.toMatchObject({ code: "local_out_of_memory", requestId: ID });
    fake.jobs.set(ID, { id: ID, status: "cancelled" });
    await expect(result(ID)).rejects.toMatchObject({ code: "cancelled" });
  });

  it("cancels through the jobs API", async () => {
    await submit(BODY, { idempotencyKey: ID });
    await cancel(ID);
    expect(fake.jobs.get(ID)!.status).toBe("cancelled");
  });
});

describe("local check", () => {
  it("reads the GPU and the model folders", async () => {
    await expect(check(["vae", "loras"])).resolves.toEqual({
      version: "0.9.1",
      gpu: "cuda:0 NVIDIA GeForce RTX 4090",
      vramGb: 24,
      installed: { vae: ["qwen_image_vae.safetensors"], loras: [] },
    });
  });
});

describe("local errors", () => {
  it("names a node this ComfyUI doesn't have", () => {
    expect(promptError({ error: { type: "missing_node_type", message: "Node 'x' not found.", extra_info: { class_type: "WanAnimate2ToVideo" } } })).toMatchObject({
      code: "local_node_missing",
      message: "Your ComfyUI doesn't have the WanAnimate2ToVideo node. Update ComfyUI, then retry.",
    });
  });

  it("keeps the first line of any other failure", () => {
    expect(executionError({ node_type: "VAEDecode", exception_type: "RuntimeError", exception_message: "shapes don't match\nTIPS: ..." }, ID)).toMatchObject({
      code: "local_error",
      message: "Your ComfyUI stopped at VAEDecode: shapes don't match",
      retry: "manual",
    });
  });
});
