import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";

// The moving backdrop behind the shell (Decisions, October 27, backdrop). Its
// colours are the theme's --shader-* tokens, read again whenever Settings
// changes the theme or the system switches between light and dark. Without
// WebGL, or if the shader fails, the shell's CSS gradient shows instead.
const ShaderBackdrop = lazy(() => import("./ShaderBackdrop"));

export type BackdropLook = { colours: [string, string, string]; brightness: number; still: boolean };

const REDUCED = "(prefers-reduced-motion: reduce)";
const DARK = "(prefers-color-scheme: dark)";

function readLook(): BackdropLook {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    colours: [token("--shader-1"), token("--shader-2"), token("--shader-3")],
    brightness: Number(token("--shader-brightness")) || 1,
    still: matchMedia(REDUCED).matches,
  };
}

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function useBackdropLook(): BackdropLook {
  const [look, setLook] = useState(readLook);
  useEffect(() => {
    const update = () => {
      const next = readLook();
      setLook((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
    };
    const theme = new MutationObserver(update);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const queries = [matchMedia(DARK), matchMedia(REDUCED)];
    queries.forEach((query) => query.addEventListener("change", update));
    return () => {
      theme.disconnect();
      queries.forEach((query) => query.removeEventListener("change", update));
    };
  }, []);
  return look;
}

class Fallback extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function Backdrop() {
  const look = useBackdropLook();
  const [webgl] = useState(webglAvailable);
  if (!webgl) return null;
  return (
    <div className="shell-backdrop" aria-hidden>
      <Fallback>
        <Suspense fallback={null}>
          <ShaderBackdrop look={look} />
        </Suspense>
      </Fallback>
    </div>
  );
}
