// @vitest-environment jsdom
// A failed take has its own Retry (Decisions, October 21, U5, item 5).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Job } from "@/lib/types/jobs";
import { OutputTake } from "./OutputTake";

const retryJob = vi.fn(async (_id: string) => undefined);
vi.mock("@/lib/jobs/runner", () => ({ retryJob: (id: string) => retryJob(id) }));
vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });

afterEach(cleanup);

const failed = (retry: "manual" | "never"): Job =>
  ({
    id: "j1",
    kind: "image",
    status: "failed",
    error: { code: "provider_error", message: "The provider didn't finish this one. Retry it?", requestId: "r", retry },
    generationIds: [],
    input: {},
    createdAt: 1,
    updatedAt: 1,
  }) as unknown as Job;

describe("OutputTake", () => {
  it("puts Retry under a failed take's message", () => {
    render(<OutputTake job={failed("manual")} alt="A lighthouse" aspect="1 / 1" />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retryJob).toHaveBeenCalledWith("j1");
  });

  it("leaves Retry out when a retry would fail again", () => {
    render(<OutputTake job={failed("never")} alt="A lighthouse" aspect="1 / 1" />);
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });
});
