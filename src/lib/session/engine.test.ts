// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const checkLocal = vi.fn();
vi.mock("@/lib/router/client", async (original) => ({ ...(await original<object>()), checkLocal: (...args: unknown[]) => checkLocal(...args) }));

const { useEngineStore, watchLocal } = await import("./engine");

describe("watchLocal", () => {
  let stop: () => void;
  beforeEach(() => {
    vi.useFakeTimers();
    checkLocal.mockReset();
    useEngineStore.setState({ localEnabled: true, check: "unreachable", info: undefined });
    stop = watchLocal();
  });
  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it("picks up a ComfyUI that comes back, then checks only every minute", async () => {
    checkLocal.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue({ installed: {} });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(checkLocal).toHaveBeenCalledTimes(1);
    expect(useEngineStore.getState().check).toBe("unreachable");
    await vi.advanceTimersByTimeAsync(15_000);
    expect(checkLocal).toHaveBeenCalledTimes(2);
    expect(useEngineStore.getState().check).toBe("ok");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(checkLocal).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(35_000);
    expect(checkLocal).toHaveBeenCalledTimes(3);
  });

  it("checks at once when the tab comes back into view, and never when it's off", async () => {
    checkLocal.mockResolvedValue({ installed: {} });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(checkLocal).toHaveBeenCalledTimes(1);
    useEngineStore.setState({ localEnabled: false });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(checkLocal).toHaveBeenCalledTimes(1);
  });
});
