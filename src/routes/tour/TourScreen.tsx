import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { Note, Screen } from "@/components/shell/Screen";
import { BeforeAfter } from "@/components/studio/BeforeAfter";
import { SplitView } from "@/components/studio/SplitView";
import { ScoreBadge, Take } from "@/components/studio/Take";
import { Button, buttonVariants } from "@/components/ui/button";
import { useKeyStore } from "@/lib/session/key";
import { loadTour, sampleUrl, tryWithWalt, type Tour, type TourItem } from "@/lib/tour/tour";
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

// Every chapter ends here (spec: Decisions, October 21, item 11): Walt into
// the vault if he isn't there, then the matching studio with Walt cast and the
// preset picked.
function TryWithWalt({ tour, chapter }: { tour: Tour; chapter: string }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const first = tour.character.name.split(" ")[0];
  async function go() {
    setBusy(true);
    setError(undefined);
    try {
      const { to, state } = await tryWithWalt(tour, chapter);
      navigate(to, state ? { state } : undefined);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={() => void go()} disabled={busy}>
        {busy ? `Adding ${first}` : `Try this with ${first}`}
      </Button>
      {error && (
        <p className="text-control text-drift" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Chapter({ id, title, body, tour, children }: { id: string; title: string; body: ReactNode; tour: Tour; children: ReactNode }) {
  return (
    <section id={`tour-${id}`} aria-labelledby={`tour-${id}-title`} className="grid scroll-mt-16 gap-4 lg:scroll-mt-6">
      <h2 id={`tour-${id}-title`} className="font-display text-screen font-extrabold">
        {title}
      </h2>
      <p className="max-w-[70ch] text-body">{body}</p>
      {children}
      <TryWithWalt tour={tour} chapter={id} />
    </section>
  );
}

const CHARACTER_TITLE = "A character is a file you own";

function CharacterChapter({ tour }: { tour: Tour }) {
  const { character } = tour;
  return (
    <Chapter id="character" title={CHARACTER_TITLE} body={character.description} tour={tour}>
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
    </Chapter>
  );
}

const SHORT: Record<string, string> = {
  character: "Character",
  images: "Images",
  realism: "Make it real",
  video: "Video",
  recast: "Recast",
  director: "Director",
  elements: "Elements",
};

// The chapter list stays in view and marks the chapter on screen. Buttons,
// not #links: the hash belongs to the router.
function Chapters({ chapters }: { chapters: { id: string; short: string }[] }) {
  const [current, setCurrent] = useState(chapters[0]?.id);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setCurrent(visible.target.id.replace(/^tour-/, ""));
      },
      { rootMargin: "0px 0px -60% 0px" },
    );
    for (const c of chapters) {
      const el = document.getElementById(`tour-${c.id}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [chapters.map((c) => c.id).join()]);
  return (
    <nav aria-label="Tour chapters" className="sticky top-0 z-10 -mx-6 overflow-x-auto border-b border-rule bg-proof px-6 py-2 lg:top-6 lg:mx-0 lg:self-start lg:border-0 lg:p-0">
      <ol className="flex gap-1 lg:grid">
        {chapters.map((c, i) => (
          <li key={c.id} className="shrink-0">
            <button
              type="button"
              aria-current={current === c.id ? "true" : undefined}
              onClick={() => document.getElementById(`tour-${c.id}`)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}
              className={cn(
                "flex w-full items-baseline gap-2 rounded-control px-2 py-1.5 text-left text-control hover:bg-tint-hover",
                current === c.id ? "bg-tint-active font-semibold text-ink" : "text-ink-muted",
              )}
            >
              <span className="font-display text-panel font-extrabold">{i + 1}</span>
              {c.short}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function TourScreen() {
  const [tour, setTour] = useState<Tour>();
  const [error, setError] = useState<string>();
  const keyLocation = useKeyStore((s) => s.location);

  useEffect(() => {
    loadTour().then(setTour, (err: Error) => setError(err.message));
  }, []);

  const chapters = tour ? ["character", ...tour.sections.map((s) => s.id)].map((id) => ({ id, short: SHORT[id] ?? id })) : [];
  const first = tour?.character.name.split(" ")[0];

  return (
    <Screen
      title="Tour"
      actions={
        keyLocation === "none" ? (
          <Link to="/settings" className={buttonVariants({ variant: "secondary" })}>
            Add your key
          </Link>
        ) : undefined
      }
    >
      <div className="grid gap-8 lg:grid-cols-[11rem_minmax(0,1fr)]">
        {tour ? <Chapters chapters={chapters} /> : <span />}
        <div className="grid min-w-0 gap-14">
          <Note>
            Everything here was made in Portraius Studio{tour ? ` with ${tour.character.name}, a designed character,` : ""} and plays from this site. Nothing
            calls a model, so no key is needed. Each chapter ends with a button that opens that studio with {first ?? "him"} cast and the preset picked.
          </Note>
          {error && (
            <p className="text-body text-drift" role="alert">
              {error}
            </p>
          )}
          {tour && (
            <>
              <CharacterChapter tour={tour} />
              {tour.sections.map((section) => (
                <Chapter key={section.id} id={section.id} title={section.title} body={section.body} tour={tour}>
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))] gap-6 rounded-media bg-seamless p-6">
                    {section.items.map((item) => (
                      <Sample key={JSON.stringify(item.media)} item={item} />
                    ))}
                  </div>
                </Chapter>
              ))}
              <section className="grid gap-3 border-t border-rule pt-6">
                <h2 className="text-panel font-semibold">Make your own</h2>
                <p className="max-w-[70ch] text-body">
                  Paste a Comfy API key with Router access in Settings. It stays in this browser and goes only to Comfy. Then make a character from
                  your photos, design one, or keep using {tour.character.name}.
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
      </div>
    </Screen>
  );
}
