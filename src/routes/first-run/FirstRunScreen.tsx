import { Link, Navigate } from "react-router";
import { buttonVariants } from "@/components/ui/button";
import { Screen } from "@/components/shell/Screen";
import { useKeyStore } from "@/lib/session/key";
import { useCharacterCount } from "@/lib/store/hooks";

const STEPS = [
  { title: "Add your Comfy API key", body: "Paste a key with Router access. It stays in this browser.", to: "/settings", action: "Add key" },
  { title: "Make a character", body: "From a few of your own photos, or designed from a description.", to: "/characters/new", action: "Make a character" },
  { title: "Run a preset", body: "Put your character into an image, a video or a recast.", to: "/image", action: "Open Image" },
];

export function FirstRunScreen() {
  const keyLocation = useKeyStore((s) => s.location);
  const characters = useCharacterCount();
  if (keyLocation !== "none" && characters !== undefined && characters > 0) {
    return <Navigate to="/characters" replace />;
  }
  return (
    <Screen title="Portraius Studio">
      <p className="mb-8 max-w-[70ch] text-body">
        Turn your own photos into a character file you keep, then make images, videos and recasts with it.
      </p>
      <ol className="grid max-w-3xl gap-4">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex flex-wrap items-center gap-4 border-t border-rule pt-4">
            <span className="w-8 font-display text-slate font-extrabold" aria-hidden>
              {index + 1}
            </span>
            <div className="min-w-48 flex-1">
              <h2 className="text-panel font-semibold">{step.title}</h2>
              <p className="text-body text-ink-muted">{step.body}</p>
            </div>
            <Link to={step.to} className={buttonVariants({ variant: index === 0 ? "primary" : "secondary" })}>
              {step.action}
            </Link>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-body">
        No key yet?{" "}
        <Link to="/tour" className="font-semibold underline underline-offset-4">
          Take the tour
        </Link>{" "}
        with pre-made samples.
      </p>
    </Screen>
  );
}
