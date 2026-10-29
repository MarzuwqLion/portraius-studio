import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Screen } from "@/components/shell/Screen";
import { Field, Segmented } from "@/components/studio/fields";
import { Take } from "@/components/studio/Take";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { saveFromReference } from "@/lib/characters/reference";
import type { Appearance } from "@/lib/types/records";

type Kind = "person" | "location" | "prop" | "outfit";

const KINDS: { value: Kind; label: string }[] = [
  { value: "person", label: "Character" },
  { value: "location", label: "Location" },
  { value: "prop", label: "Prop" },
  { value: "outfit", label: "Outfit" },
];

const APPEARANCES: { value: Appearance; label: string }[] = [
  { value: "real", label: "Real-looking" },
  { value: "animated", label: "Animated" },
];

// Your own character sheet or concept art, saved as it is (Decisions,
// October 29). For designed characters only: a real person makes theirs from
// photos, with the webcam check.
export function ReferenceCharacter() {
  const navigate = useNavigate();
  const [kind, setKind] = useState<Kind>("person");
  const [appearance, setAppearance] = useState<Appearance>("real");
  const [artStyle, setArtStyle] = useState("");
  const [image, setImage] = useState<File>();
  const [preview, setPreview] = useState<string>();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const ids = { name: useId(), description: useId() };
  const person = kind === "person";

  useEffect(() => {
    if (!image) return setPreview(undefined);
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const waitingFor = !image ? "Add the reference image" : !name.trim() ? "Give it a name" : !rights ? "Confirm the image is yours to use" : undefined;

  async function save() {
    if (waitingFor || busy || !image) return;
    setBusy(true);
    setError(undefined);
    try {
      const record = await saveFromReference({
        kind: person ? "person" : "element",
        ...(person ? { appearance, ...(appearance === "animated" ? { artStyle } : {}) } : { elementType: kind }),
        name,
        description,
        image,
      });
      navigate(`/characters/${record.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Screen title="Add your own reference">
      <form
        className="grid max-w-3xl gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <p className="max-w-[70ch] text-body">
          A character sheet, concept art or a location you made, used exactly as it is: it goes to the video and image models as this character's
          reference, with nothing redrawn. For designed characters only. A real person makes their own character from photos.
        </p>
        <Segmented label="What it is" value={kind} onChange={setKind} options={KINDS} columns={4} />

        <Field label="Reference image" hint="One image: a turnaround or character sheet works best. JPEG, PNG or WebP.">
          {(id) => (
            <div className="grid gap-2">
              {preview && <Take src={preview} alt="The reference image" aspect="16 / 9" className="max-w-xl" />}
              <Button id={id} type="button" variant="secondary" size="sm" className="justify-self-start" onClick={() => input.current?.click()}>
                {image ? "Replace image" : "Choose an image"}
              </Button>
              <input
                ref={input}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                aria-label="Upload a reference image"
                tabIndex={-1}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) setImage(file);
                }}
              />
            </div>
          )}
        </Field>

        {person && (
          <>
            <Segmented label="How they're drawn" value={appearance} onChange={setAppearance} options={APPEARANCES} />
            {appearance === "animated" && (
              <Field label="Art style (optional)" hint="Kept in every prompt with them, e.g. cel-shaded anime.">
                {(id) => <Input id={id} value={artStyle} onChange={(e) => setArtStyle(e.target.value)} maxLength={200} />}
              </Field>
            )}
          </>
        )}

        <div className="grid gap-2">
          <label htmlFor={ids.name} className="text-control font-semibold">
            Name
          </label>
          <Input id={ids.name} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={person ? "Odette" : "Neo-Atlantis Night Quarter"} />
        </div>
        <div className="grid gap-2">
          <label htmlFor={ids.description} className="text-control font-semibold">
            Description (optional)
          </label>
          <p className="text-control text-ink-muted">
            {person
              ? "Goes into every prompt with this character: who they are, how they carry themselves, how they sound."
              : "Goes into every prompt with this element: what it is and anything the image doesn't show."}
          </p>
          <textarea
            id={ids.description}
            value={description}
            maxLength={2000}
            rows={4}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-control border border-rule bg-proof p-3 text-body text-ink"
          />
        </div>

        <label className="flex max-w-[70ch] items-start gap-3 text-body">
          <Checkbox checked={rights} onCheckedChange={(v) => setRights(v === true)} className="mt-0.5" />
          <span>
            {person
              ? "This is an original character I made or have the rights to use. It isn't a photo of a real person."
              : "I made this image or have the rights to use it."}
          </span>
        </label>

        {error && (
          <p className="text-control text-drift" role="alert">
            {error}
          </p>
        )}
        <div className="flex items-center gap-4">
          <Button type="submit" disabled={Boolean(waitingFor) || busy}>
            {busy ? "Saving" : "Save to your vault"}
          </Button>
          {waitingFor && <span className="text-control text-ink-muted">{waitingFor}</span>}
        </div>
      </form>
    </Screen>
  );
}
