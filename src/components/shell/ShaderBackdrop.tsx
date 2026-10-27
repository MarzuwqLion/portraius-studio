import { useEffect, useRef } from "react";
import { ShaderGradient, ShaderGradientCanvas } from "@shadergradient/react";
import type { BackdropLook } from "./Backdrop";

// portraius.com's waterPlane, in the theme's three colours. Its own
// chunk, so three.js loads after the first paint. Lit by three.js lights
// ("3d") only: "env" lighting downloads HDR files from shadergradient's
// site, which the CSP and the no-third-party rule both rule out.
export default function ShaderBackdrop({ look }: { look: BackdropLook }) {
  // The canvas sizes itself from a measurement that can miss its first
  // layout (seen on the live site in a tab that loads hidden), leaving it
  // blank until the window resizes. Until three.js has set the canvas's
  // size, a resize event every 250 ms (for 5 s at most) has it measure again.
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let tries = 0;
    const timer = setInterval(() => {
      const canvas = box.current?.querySelector("canvas");
      if (canvas?.style.width || ++tries > 20) clearInterval(timer);
      else window.dispatchEvent(new Event("resize"));
    }, 250);
    return () => clearInterval(timer);
  }, []);
  return (
    <div ref={box} className="contents">
      <ShaderGradientCanvas pointerEvents="none" lazyLoad={false} pixelDensity={1} fov={45}>
        <ShaderGradient
          control="props"
          type="waterPlane"
          animate={look.still ? "off" : "on"}
          color1={look.colours[0]}
          color2={look.colours[1]}
          color3={look.colours[2]}
          brightness={look.brightness}
          lightType="3d"
          envPreset="city"
          grain="off"
          reflection={0.1}
          cAzimuthAngle={170}
          cPolarAngle={70}
          cDistance={4.4}
          cameraZoom={1}
          positionX={0}
          positionY={0.9}
          positionZ={-0.3}
          rotationX={45}
          rotationY={0}
          rotationZ={0}
          uAmplitude={0}
          uDensity={1.2}
          uFrequency={0}
          uSpeed={0.2}
          uStrength={3.4}
          uTime={0}
          wireframe={false}
        />
      </ShaderGradientCanvas>
    </div>
  );
}
