import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { launchOf, type Launch } from "@/lib/studio/launch";

// Applies a Tour launch (lib/studio/launch.ts) once per navigation.
export function useLaunch(apply: (launch: Launch) => void): void {
  const location = useLocation();
  const latest = useRef(apply);
  latest.current = apply;
  useEffect(() => {
    const launch = launchOf(location.state);
    if (launch) latest.current(launch);
  }, [location.key]);
}
