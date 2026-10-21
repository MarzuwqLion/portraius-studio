// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RealismAction } from "./Realism";

const startRealism = vi.fn(async (generationId: string, strength: number) => ({ id: `job-for-${generationId}-${strength}` }));

vi.mock("@/lib/studio/realism", () => ({
  DEFAULT_STRENGTH: 80,
  startRealism: (generationId: string, strength: number) => startRealism(generationId, strength),
  realismSource: () => undefined,
}));
vi.mock("@/lib/jobs/hooks", () => ({ useEstimateLabel: () => "≈ $0.37", useJob: () => undefined }));

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
