import { describe, expect, it } from "vitest";
import recorded from "../../../test/fixtures/sync-3.result.json";
import { sync3, type Sync3Result } from "./sync3";

describe("sync3.buildBody", () => {
  it("sends the clip and the line as links, cutting off the longer one", () => {
    expect(sync3.buildBody({ videoUrl: "https://w.example/m/a.mp4", audioUrl: "https://w.example/m/b.mp3" })).toEqual({
      input: [
        { type: "video", url: "https://w.example/m/a.mp4" },
        { type: "audio", url: "https://w.example/m/b.mp3" },
      ],
      options: { sync_mode: "cut_off" },
    });
  });

  it("refuses inline media", () => {
    expect(() => sync3.buildBody({ videoUrl: "data:video/mp4;base64,AAAA", audioUrl: "https://w.example/m/b.mp3" })).toThrow(/public links/);
  });
});

describe("sync3.extractAssets", () => {
  it("reads a recorded result: Sync Labs' own link, which the Worker fetches", () => {
    // The recording has nulls where the schema has optional fields.
    const [asset] = sync3.extractAssets(recorded as unknown as Sync3Result);
    expect(asset).toEqual({ kind: "video", url: recorded.outputUrl });
    expect(new URL(asset!.url!).host).toBe("api.sync.so");
  });

  it("reads outputUrl", () => {
    expect(sync3.extractAssets({ status: "COMPLETED", outputUrl: "https://cdn.example.com/out.mp4" })).toEqual([{ kind: "video", url: "https://cdn.example.com/out.mp4" }]);
    expect(sync3.extractAssets({ status: "FAILED" })).toEqual([]);
  });
});
