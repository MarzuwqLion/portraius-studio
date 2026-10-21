// @vitest-environment jsdom
// The Generate footer (spec: Decisions, October 21, items 1 and 2).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useKeyStore } from "@/lib/session/key";
import { GenerateFooter } from "./GenerateFooter";

afterEach(() => {
  cleanup();
  useKeyStore.setState({ location: "none" });
});

const withKey = () => useKeyStore.setState({ location: "session" });

describe("GenerateFooter", () => {
  it("runs on a click and on Cmd/Ctrl+Enter, with the price beside the button", () => {
    withKey();
    const run = vi.fn();
    render(<GenerateFooter label="Generate" price={{ state: "known", label: "≈ $0.08" }} onRun={run} />, { wrapper: MemoryRouter });
    expect(screen.getByText("≈ $0.08")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    fireEvent.keyDown(window, { key: "Enter", metaKey: true });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("says what it's waiting for, and doesn't run", () => {
    withKey();
    const run = vi.fn();
    render(<GenerateFooter label="Generate" price={{ state: "idle" }} waitingFor="Write a prompt" onRun={run} />, { wrapper: MemoryRouter });
    expect(screen.getByText("Write a prompt")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Generate" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    expect(run).not.toHaveBeenCalled();
  });

  it("asks for a key when everything else is ready", () => {
    const run = vi.fn();
    render(<GenerateFooter label="Generate" price={{ state: "known", label: "≈ $0.08" }} onRun={run} />, { wrapper: MemoryRouter });
    expect(screen.getByRole("link", { name: "Add your Comfy API key" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    expect(run).not.toHaveBeenCalled();
  });

  it("says once when there's no published price", () => {
    withKey();
    render(<GenerateFooter label="Generate" price={{ state: "unavailable" }} onRun={() => undefined} />, { wrapper: MemoryRouter });
    expect(screen.getByText("Prices aren't available for this key; Comfy bills your account as usual.")).toBeTruthy();
  });
});
