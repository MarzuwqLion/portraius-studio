// @vitest-environment jsdom
// A local job says so while the visitor's ComfyUI is down (4090 app checks, October 23).
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MODEL_IDS } from "@/lib/registry/models";
import { useEngineStore } from "@/lib/session/engine";
import type { Job } from "@/lib/types/jobs";
import { JobsTray } from "./JobsTray";

let jobs: Job[] = [];
vi.mock("@/lib/jobs/hooks", () => ({ useRecentJobs: () => jobs }));
vi.mock("@/lib/jobs/runner", () => ({ cancelJob: vi.fn(), retryJob: vi.fn() }));
vi.mock("@/lib/store/hooks", () => ({ useBlobUrl: () => undefined, useGeneration: () => undefined }));

afterEach(cleanup);

const running = (modelId: string): Job => ({ id: modelId, kind: "video", modelId, status: "running", generationIds: [], input: {}, createdAt: Date.now(), updatedAt: Date.now() }) as unknown as Job;

describe("JobsTray", () => {
  it("shows a local job as waiting while the ComfyUI is unreachable, and a Router job as generating", () => {
    jobs = [running(MODEL_IDS.localWanFast), running(MODEL_IDS.minimaxH3)];
    useEngineStore.setState({ check: "unreachable" });
    render(<MemoryRouter><JobsTray /></MemoryRouter>);
    expect(screen.getByText("Waiting for your ComfyUI")).toBeTruthy();
    expect(screen.getByText("Generating")).toBeTruthy();
  });

  it("says Generating once the ComfyUI answers", () => {
    jobs = [running(MODEL_IDS.localWanFast)];
    useEngineStore.setState({ check: "ok" });
    render(<MemoryRouter><JobsTray /></MemoryRouter>);
    expect(screen.queryByText("Waiting for your ComfyUI")).toBeNull();
    expect(screen.getByText("Generating")).toBeTruthy();
  });
});
