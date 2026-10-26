import { useRef, useState, type DragEvent } from "react";
import { Take } from "@/components/studio/Take";
import { Button } from "@/components/ui/button";
import { MAX_PHOTOS, MIN_PHOTOS, addPhoto, goodPhotos } from "@/lib/characters/create";
import { deleteDraftBlob, type DraftPhoto, type PhotoQuality, type WizardDraft } from "@/lib/characters/draft";
import { useBlobUrl } from "@/lib/store/hooks";
import { cn } from "@/lib/utils";
import { AppearanceField } from "./AppearanceField";
import type { UpdateDraft } from "./useDraft";

const QUALITY_TEXT: Record<PhotoQuality, string> = {
  good: "Good",
  "no-face": "No face found",
  "several-faces": "More than one face",
  "small-face": "Face too small",
  blurry: "Too blurry",
};

function PhotoTake({ photo, index, onRemove }: { photo: DraftPhoto; index: number; onRemove: () => void }) {
  const url = useBlobUrl(photo.blobId);
  const good = photo.quality === "good";
  return (
    <div className="grid gap-2">
      <Take src={url} alt={`Photo ${index + 1}`} aspect={`${photo.width} / ${photo.height}`} rejected={!good} />
      <div className="flex items-center justify-between gap-2">
        <span className={cn("text-control font-semibold", good ? "text-ink" : "text-drift")}>{QUALITY_TEXT[photo.quality]}</span>
        <Button variant="ghost" size="sm" onClick={onRemove}>
          Remove
        </Button>
      </div>
    </div>
  );
}

export function PhotosStep({ draft, update, onNext }: { draft: WizardDraft; update: UpdateDraft; onNext: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [checking, setChecking] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string>();
  const good = goodPhotos(draft).length;
  const room = MAX_PHOTOS - draft.photos.length;

  async function add(files: File[]) {
    setError(undefined);
    const images = files.filter((f) => f.type.startsWith("image/")).slice(0, Math.max(0, room));
    if (files.length && !images.length) setError("Those weren't images. Add JPEG, PNG or WebP photos.");
    for (let i = 0; i < images.length; i++) {
      setChecking(images.length - i);
      try {
        const photo = await addPhoto(draft, images[i]!);
        update((d) => ({ photos: [...d.photos, photo] }));
      } catch {
        setError("A photo couldn't be checked. Reload the page and add it again.");
      }
    }
    setChecking(0);
  }

  function remove(photo: DraftPhoto) {
    update((d) => ({ photos: d.photos.filter((p) => p.blobId !== photo.blobId) }));
    void deleteDraftBlob(photo.blobId);
  }

  function drop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void add([...e.dataTransfer.files]);
  }

  return (
    <div className="grid gap-6">
      <AppearanceField draft={draft} update={update} />
      <div className="grid gap-2">
        <h2 className="text-panel font-semibold">Add {MIN_PHOTOS} to {MAX_PHOTOS} photos of yourself</h2>
        <p className="max-w-[70ch] text-body text-ink-muted">
          Varied angles, good light, no sunglasses, and one face per photo. Each photo is checked here in your browser; nothing is uploaded
          until you draw the sheet.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
        className={cn("flex flex-col items-center justify-center gap-3 rounded-media border border-dashed p-8 text-center", dragging ? "border-ink bg-tint-hover" : "border-rule")}
      >
        <p className="text-body">Drop photos here, or</p>
        <Button variant="secondary" onClick={() => input.current?.click()} disabled={room <= 0 || checking > 0}>
          Choose photos
        </Button>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          multiple
          className="sr-only"
          aria-label="Choose photos of yourself"
          tabIndex={-1}
          onChange={(e) => {
            void add([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        {checking > 0 && <p className="text-control text-ink-muted" role="status">Checking {checking === 1 ? "1 photo" : `${checking} photos`}</p>}
        {error && <p className="text-control text-drift" role="alert">{error}</p>}
      </div>

      {draft.photos.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {draft.photos.map((photo, i) => (
            <PhotoTake key={photo.blobId} photo={photo} index={i} onRemove={() => remove(photo)} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={onNext} disabled={good < MIN_PHOTOS || checking > 0}>
          Continue to the consent check
        </Button>
        <span className="text-control text-ink-muted">
          {good} of {MIN_PHOTOS} or more good photos
        </span>
      </div>
    </div>
  );
}
