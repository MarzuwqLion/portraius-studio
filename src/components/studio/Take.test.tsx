// @vitest-environment jsdom
// Score wording and the pick label (spec: Identity match score, Bands and
// actions; Signature: grease-pencil marks).
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScoreBadge, Take } from "./Take";

// The grease mark measures itself; jsdom has no ResizeObserver.
vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });

afterEach(cleanup);

describe("ScoreBadge", () => {
  it("reads as Likeness with a whole number and the band's name", () => {
    render(<ScoreBadge score={89.5} />);
    expect(screen.getByText("Likeness")).toBeTruthy();
    expect(screen.getByText("90")).toBeTruthy();
    expect(screen.getByText("Strong")).toBeTruthy();
  });

  it("names the Review and Drifted bands at the same thresholds", () => {
    const { rerender } = render(<ScoreBadge score={60} />);
    expect(screen.getByText("Review")).toBeTruthy();
    rerender(<ScoreBadge score={59.4} />);
    expect(screen.getByText("Drifted")).toBeTruthy();
  });

  it("adds a video's lowest frame, rounded", () => {
    render(<ScoreBadge score={95} lowest={92.6} />);
    expect(screen.getByText("Lowest frame 93")).toBeTruthy();
  });

  it("explains itself behind an ⓘ, unless it sits inside a link", () => {
    const { rerender } = render(<ScoreBadge score={95} />);
    expect(screen.getByRole("button", { name: "What Likeness measures" })).toBeTruthy();
    rerender(<ScoreBadge score={95} info={false} />);
    expect(screen.queryByRole("button", { name: "What Likeness measures" })).toBeNull();
  });
});

describe("Take", () => {
  it("says Selected under a pick, in words", () => {
    const { rerender } = render(<Take src="data:," alt="Walt" aspect="1 / 1" picked onPick={() => undefined} />);
    expect(screen.getByText("✓ Selected")).toBeTruthy();
    rerender(<Take src="data:," alt="Walt" aspect="1 / 1" onPick={() => undefined} />);
    expect(screen.queryByText("✓ Selected")).toBeNull();
  });
});
