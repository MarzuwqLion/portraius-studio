import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router";
import { ScreenTitle } from "@/components/shell/Screen";
import { SplitView } from "@/components/studio/SplitView";
import { buttonVariants } from "@/components/ui/button";
import { useKeyStore } from "@/lib/session/key";
import { useCharacterCount } from "@/lib/store/hooks";
import { loadTour, samplePoster, sampleUrl, type Tour } from "@/lib/tour/tour";

const STEPS = [
  { title: "Add your Comfy API key", body: "One with Router access. It stays in this browser." },
  { title: "Make a character", body: "From a few of your own photos, designed from a description, or use Walt from the Tour." },
  { title: "Run a preset", body: "Put them into an image, a video or a recast, and see how close the likeness is." },
];

// First run (spec: Decisions, October 21, item 11): the product working on
// the right before anything is read, and two ways in of equal weight.
export function FirstRunScreen() {
  const keyLocation = useKeyStore((s) => s.location);
  const characters = useCharacterCount();
  const [tour, setTour] = useState<Tour>();
  useEffect(() => {
    loadTour().then(setTour, () => undefined);
  }, []);
  if (keyLocation !== "none" && characters !== undefined && characters > 0) {
    return <Navigate to="/characters" replace />;
  }
  const recast = tour?.sections.flatMap((s) => s.items).find((i) => i.media.kind === "split");
  const media = recast?.media.kind === "split" ? recast.media : undefined;

  return (
    <div className="grid min-h-full lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <section className="grid content-center gap-8 px-6 py-10 lg:px-10">
        <div className="grid gap-4">
          <ScreenTitle>Portraius Studio</ScreenTitle>
          <p className="max-w-[48ch] text-panel">Turn your own photos into a character file you keep, then make images, videos and recasts with it.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Link to="/tour" className={buttonVariants({ variant: "primary", className: "h-12 text-body" })}>
            Take the tour (no key)
          </Link>
          <Link to="/settings" className={buttonVariants({ variant: "primary", className: "h-12 text-body" })}>
            Add your key
          </Link>
        </div>
        <ol className="grid gap-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="grid grid-cols-[2rem_1fr] gap-x-3 border-t border-rule pt-4">
              <span className="font-display text-screen font-extrabold" aria-hidden>
                {index + 1}
              </span>
              <div>
                <h2 className="text-body font-semibold">{step.title}</h2>
                <p className="text-control text-ink-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section aria-label="Sample: a recast" className="flex flex-col justify-center gap-3 bg-seamless p-6 text-on-seamless lg:p-10">
        {media ? (
          <>
            <SplitView
              original={sampleUrl(media.original)}
              recast={sampleUrl(media.recast)}
              posters={{ original: samplePoster(media.original), recast: samplePoster(media.recast) }}
              aspect={`${media.width} / ${media.height}`} autoPlay startAt={5} />
            <p className="text-control">
              <span className="rounded-control bg-proof px-2 py-0.5 font-semibold text-ink">Pre-made sample</span> A dancer's clip, performed by Walt Harmon:
              same moves, same timing, same camera. Drag the line to compare.
            </p>
          </>
        ) : (
          <div className="aspect-video w-full rounded-media border border-rule" />
        )}
      </section>
    </div>
  );
}
