import { useRef, useState, type DragEvent } from "react";
import { Segmented } from "@/components/studio/fields";
import { Take } from "@/components/studio/Take";
import { Button } from "@/components/ui/button";
import { addPhoto, photoLimits } from "@/lib/characters/create";
import { deleteDraftBlob, type DraftPhoto, type WizardDraft } from "@/lib/characters/draft";
import { ELEMENT_TYPES, ELEMENT_TYPE_LABEL, type ElementType } from "@/lib/characters/element-sheet";
import { useBlobUrl } from "@/lib/store/hooks";
import { cn } from "@/lib/utils";
import type { UpdateDraft } from "./useDraft";

const WHAT: Record<ElementType, string> = {
  outfit: "the outfit laid flat, on a hanger or worn, from the front and back",
  prop: "the object from a few sides, in good light",
  location: "the place from a few angles, wide and close",
};

function PhotoTake({ photo, index, onRemove }: { photo: DraftPhoto; index: number; onRemove: () => void }) {
  const url = useBlobUrl(photo.blobId);
  return (
    <div className="grid gap-2">
      <Take src={url} alt={`Photo ${index + 1}`} aspect={`${photo.width} / ${photo.height}`} />
      <Button variant="ghost" size="sm" onClick={onRemove} className="justify-self-start">
        Remove
      </Button>
    </div>
  );
}

// Step 1 for an element: what kind it is, the trademark warning, and 1 to 6 photos.
export function ElementPhotosStep({ draft, update, onNext }: { draft: WizardDraft; update: UpdateDraft; onNext: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string>();
  const { min, max } = photoLimits("element");
  const type = draft.elementType ?? "outfit";
  const room = max - draft.photos.length;

  async function add(files: File[]) {
    setError(undefined);
    const images = files.filter((f) => f.type.startsWith("image/")).slice(0, Math.max(0, room));
    if (files.length && !images.length) setError("Those weren't images. Add JPEG, PNG or WebP photos.");
    for (let i = 0; i < images.length; i++) {
      setAdding(images.length - i);
      try {
        const photo = await addPhoto(draft, images[i]!);
        update((d) => ({ photos: [...d.photos, photo] }));
      } catch {
        setError("A photo couldn't be read. Try a JPEG or PNG.");
      }
    }
    setAdding(0);
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
      <div className="grid max-w-md gap-2">
        <h2 className="text-panel font-semibold">What is it?</h2>
        <Segmented label="Element type" value={type} onChange={(v) => update({ elementType: v })} options={ELEMENT_TYPES.map((t) => ({ value: t, label: ELEMENT_TYPE_LABEL[t] }))} />
      </div>

      <div className="grid gap-2">
        <h2 className="text-panel font-semibold">
          Add {min} to {max} photos
        </h2>
        <p className="max-w-[70ch] text-body text-ink-muted">Photograph {WHAT[type]}. More angles give a closer sheet.</p>
        <p className="max-w-[70ch] border-l-2 border-ink pl-3 text-body">
          Use your own designs or plain, unbranded things. Leave out logos, brand names, characters and trademarked designs: the sheet is drawn
          without them, and someone else's IP can't be used here.
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
        <Button variant="secondary" onClick={() => input.current?.click()} disabled={room <= 0 || adding > 0}>
          Choose photos
        </Button>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          multiple
          className="sr-only"
          aria-label="Choose photos of the element"
          tabIndex={-1}
          onChange={(e) => {
            void add([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        {adding > 0 && (
          <p className="text-control text-ink-muted" role="status">
            Adding {adding === 1 ? "1 photo" : `${adding} photos`}
          </p>
        )}
        {error && (
          <p className="text-control text-drift" role="alert">
            {error}
          </p>
        )}
      </div>

      {draft.photos.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {draft.photos.map((photo, i) => (
            <PhotoTake key={photo.blobId} photo={photo} index={i} onRemove={() => remove(photo)} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={onNext} disabled={draft.photos.length < min || adding > 0}>
          Continue to the sheet
        </Button>
        <span className="text-control text-ink-muted">
          {draft.photos.length} of {max} photos
        </span>
      </div>
    </div>
  );
}
