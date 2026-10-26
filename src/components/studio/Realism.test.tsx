// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MODEL_IDS } from "@/lib/registry/models";
import type { Job } from "@/lib/types/jobs";
import { RealismAction, RealismTake } from "./Realism";

const startRealism = vi.fn(async (generationId: string, strength: number) => ({ id: `job-for-${generationId}-${strength}` }));

vi.mock("@/lib/studio/realism", () => ({
  DEFAULT_STRENGTH: 80,
  startRealism: (generationId: string, strength: number) => startRealism(generationId, strength),
  realismSource: () => undefined,
}));
vi.mock("@/lib/jobs/hooks", () => ({ useEstimateLabel: () => "≈ $0.37", useJob: () => undefined }));
vi.mock("@/lib/store/hooks", () => ({ useBlobUrl: () => undefined, useCharacters: () => [], useGeneration: () => undefined }));

afterEach(() => {
  cleanup();
  startRealism.mockClear();
});

describe("RealismAction", () => {
  it("starts the pass with no onStarted listener", async () => {
    render(<RealismAction generationId="still-1" />, { wrapper: MemoryRouter });
    fireEvent.click(screen.getByRole("button", { name: /Make it real/ }));
    await waitFor(() => expect(startRealism).toHaveBeenCalledWith("still-1", 80));
  });

  it("hands the started job to onStarted, at the chosen strength", async () => {
    const onStarted = vi.fn();
    render(<RealismAction generationId="still-2" onStarted={onStarted} />, { wrapper: MemoryRouter });
    fireEvent.change(screen.getByLabelText(/^Realism strength/), { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: /Make it real/ }));
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith({ id: "job-for-still-2-40" }));
  });
});

describe("RealismTake", () => {
  const pass = (modelId: string): Job => ({ id: "p", kind: "enhance", modelId, status: "running", generationIds: [], input: { request: { sourceGenerationId: "g", strength: 80 } }, createdAt: 1, updatedAt: 1 }) as unknown as Job;

  it("names the strength of a skin-enhancer pass", () => {
    render(<RealismTake job={pass(MODEL_IDS.freepikSkin)} />, { wrapper: MemoryRouter });
    expect(screen.getByText("Make it real, strength 80")).toBeTruthy();
  });

  it("gives SeedVR2 on the visitor's GPU no strength, which it doesn't have", () => {
    render(<RealismTake job={pass(MODEL_IDS.localSeedVR2)} />, { wrapper: MemoryRouter });
    expect(screen.getByText("Make it real, on your GPU")).toBeTruthy();
  });
});
