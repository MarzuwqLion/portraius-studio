import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { addStillToElement } from "@/lib/characters/create";
import { db } from "@/lib/store/db";

// "Save as element" on a still (spec: Image studio, Results): the still becomes
// a photo in the element wizard, where the user picks outfit, prop or location.
export function SaveAsElement({ generationId, size = "sm" }: { generationId: string; size?: "sm" | "default" }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      const generation = await db.generations.get(generationId);
      const asset = generation?.assets.find((a) => a.kind === "image");
      const blob = asset ? (await db.blobs.get(asset.blobId))?.blob : undefined;
      if (!blob) throw new Error("That still isn't in your library any more.");
      await addStillToElement(blob);
      navigate("/characters/new?from=element");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <Button size={size} variant="secondary" onClick={() => void save()} disabled={busy}>
        Save as element
      </Button>
      {error && (
        <p className="text-control text-drift" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
