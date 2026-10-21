import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Note, Screen } from "@/components/shell/Screen";
import { BeforeAfter } from "@/components/studio/BeforeAfter";
import { SplitView } from "@/components/studio/SplitView";
import { ScoreBadge, Take } from "@/components/studio/Take";
import { Button, buttonVariants } from "@/components/ui/button";
import { useKeyStore } from "@/lib/session/key";
import { addSampleCharacter, loadTour, sampleUrl, type Tour, type TourItem } from "@/lib/tour/tour";
import { cn } from "@/lib/utils";

const aspect = (m: { width: number; height: number }) => `${m.width} / ${m.height}`;
// Media no taller than 70% of the screen, keeping its shape.
const fitHeight = (m: { width: number; height: number }) => `calc(70vh * ${m.width / m.height})`;

// Every sample says what it is (spec: UI and UX, Tour).
function SampleLabel() {
  return <span className="rounded-control bg-proof px-2 py-0.5 text-control font-semibold text-ink">Pre-made sample</span>;
}

function Media({ item }: { item: TourItem }): ReactNode {
  const m = item.media;
  switch (m.kind) {
    case "image":
      return (
        <div className="mx-auto w-full" style={{ maxWidth: fitHeight(m) }}>
          <Take src={sampleUrl(m.src)} alt={m.alt} aspect={aspect(m)} />
        </div>
      );
    case "video":
      return (
        <figure className="relative mx-auto w-full overflow-hidden rounded-media border border-rule bg-seamless" style={{ aspectRatio: aspect(m), maxWidth: fitHeight(m) }}>
          <video src={sampleUrl(m.src)} controls loop playsInline preload="metadata" className="absolute inset-0 size-full object-contain" aria-label={m.alt} />
        </figure>
      );
    case "split":
      return <SplitView original={sampleUrl(m.original)} recast={sampleUrl(m.recast)} aspect={aspect(m)} />;
    case "beforeAfter":
      return <BeforeAfter before={sampleUrl(m.before)} after={sampleUrl(m.after)} aspect={aspect(m)} alt={m.alt} />;
  }
}

function Sample({ item }: { item: TourItem }) {
  const wide = item.media.kind === "split";
  return (
    <div className={cn("grid content-start gap-2", wide && "col-span-full xl:col-span-2")}>
      <Media item={item} />
      <div className="flex flex-wrap items-center gap-2">
        <SampleLabel />
        {item.score !== undefined && <ScoreBadge score={item.score} {...(item.worst !== undefined ? { lowest: item.worst } : {})} />}
        {item.before !== undefined && item.after !== undefined && (
          <>
            <span className="text-control text-on-seamless">Before</span>
            <ScoreBadge score={item.before} />
            <span className="text-control text-on-seamless">After</span>
            <ScoreBadge score={item.after} />
          </>
        )}
      </div>
      <p className="text-control text-on-seamless">
        {item.caption}
        {item.model && <span> · {item.model}</span>}
      </p>
    </div>
  );
}

function CharacterSection({ tour }: { tour: Tour }) {
  const { character } = tour;
  const [added, setAdded] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function add() {
    setBusy(true);
    setError(undefined);
    try {
      setAdded(await addSampleCharacter(tour));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="tour-character" className="grid gap-4">
      <h2 id="tour-character" className="font-display text-screen font-extrabold">
        A character is a file you own
      </h2>
      <p className="max-w-[70ch] text-body">{character.description}</p>
      <div className="grid gap-6 rounded-media bg-seamless p-6 text-on-seamless">
        <div className="grid gap-2">
          <Take src={sampleUrl(character.sheet.src)} alt={`Turnaround sheet for ${character.name}`} aspect={aspect(character.sheet)} className="mx-auto w-full max-w-4xl" />
          <div className="flex flex-wrap items-center gap-2">
            <SampleLabel />
            <span className="text-control">
              {character.name}, {character.origin === "designed" ? "designed" : "from photos"}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {character.views.map((v) => (
            <figure key={v.src} className="grid content-start gap-1">
              <Take src={sampleUrl(v.src)} alt={`${v.label} view of ${character.name}`} aspect={aspect(v)} />
              <figcaption className="text-control">{v.label}</figcaption>
            </figure>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {added ? (
          <>
            <span className="text-body">{character.name} is in your vault.</span>
            <Link to={`/characters/${added}`} className={buttonVariants({ variant: "secondary" })}>
              Open {character.name}
            </Link>
          </>
        ) : (
          <Button variant="secondary" onClick={() => void add()} disabled={busy}>
            Add {character.name} to your vault
          </Button>
        )}
        <span className="text-control text-ink-muted">Then use him in any studio with your own key, no photos needed.</span>
      </div>
      {error && (
        <p className="text-control text-drift" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function TourScreen() {
  const [tour, setTour] = useState<Tour>();
  const [error, setError] = useState<string>();
  const keyLocation = useKeyStore((s) => s.location);

  useEffect(() => {
    loadTour().then(setTour, (err: Error) => setError(err.message));
  }, []);

  return (
    <Screen
      title="Tour"
      actions={
        <div className="flex flex-wrap gap-2">
          {keyLocation === "none" ? (
            <Link to="/settings" className={buttonVariants({ variant: "primary" })}>
              Add your key
            </Link>
          ) : (
            <Link to="/image" className={buttonVariants({ variant: "primary" })}>
              Open Image
            </Link>
          )}
        </div>
      }
    >
      <div className="grid gap-12">
        <Note>
          Everything here was made in Portraius Studio with a designed character, and plays from this site. Nothing calls a model, so no key is
          needed. Each sample is labelled.
        </Note>
        {error && (
          <p className="text-body text-drift" role="alert">
            {error}
          </p>
        )}
        {tour && (
          <>
            <CharacterSection tour={tour} />
            {tour.sections.map((section) => (
              <section key={section.id} aria-labelledby={`tour-${section.id}`} className="grid gap-4">
                <h2 id={`tour-${section.id}`} className="font-display text-screen font-extrabold">
                  {section.title}
                </h2>
                <p className="max-w-[70ch] text-body">{section.body}</p>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))] gap-6 rounded-media bg-seamless p-6">
                  {section.items.map((item) => (
                    <Sample key={JSON.stringify(item.media)} item={item} />
                  ))}
                </div>
              </section>
            ))}
            <section className="grid gap-3 border-t border-rule pt-6">
              <h2 className="text-panel font-semibold">Make your own</h2>
              <p className="max-w-[70ch] text-body">
                Paste a Comfy API key with Router access in Settings. It stays in this browser and goes only to Comfy. Then make a character from
                your photos, design one, or use {tour.character.name}.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link to="/settings" className={buttonVariants({ variant: "primary" })}>
                  Add your key
                </Link>
                <Link to="/characters/new" className={buttonVariants({ variant: "secondary" })}>
                  Make a character
                </Link>
              </div>
            </section>
          </>
        )}
      </div>
    </Screen>
  );
}
