import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { EXAMPLE_CHARACTERS } from "./examples";
import { importCharacter } from "./format";

const read = (slug: string) => new Blob([readFileSync(`public/examples/${slug}.portraius`)]);

describe("example characters", () => {
  it.each(EXAMPLE_CHARACTERS)("$name imports unlocked, with the id it's listed under", async (e) => {
    const { bundle, summary } = await importCharacter(read(e.slug));
    expect(bundle.file.id).toBe(e.id);
    expect(summary.name).toBe(e.name);
    expect(summary.locked).toBe(false);
    expect(bundle.file.consent ?? {}).not.toHaveProperty("checkClip");
  });

  it("ships the photo character with its consent record", async () => {
    const { bundle } = await importCharacter(read("marzuwq"));
    expect(bundle.file.origin).toBe("photos");
    expect(bundle.file.consent?.matchScore).toBe(100);
  });
});
