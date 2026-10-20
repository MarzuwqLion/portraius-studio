import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppRoutes } from "@/routes/AppRoutes";
import { scoreJobOutputs } from "@/lib/identity/score-output";
import { resumeJobs, setScorer } from "@/lib/jobs/runner";
import { persistStorage } from "@/lib/library/library";
import { registerDirector, resumeWaitingShots } from "@/lib/studio/director";
import { registerImageStudio } from "@/lib/studio/image";
import { registerRecastStudio } from "@/lib/studio/recast";
import { registerRemix } from "@/lib/studio/remix";
import { registerVideoStudio, resumeChains } from "@/lib/studio/video";
import { restoreKey, useKeyStore } from "@/lib/session/key";
import { applyTheme } from "@/lib/session/theme";
import { getSettings } from "@/lib/store/settings";
import "@/styles/index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

async function bootstrap() {
  try {
    const settings = await getSettings();
    applyTheme(settings.theme);
    await restoreKey();
  } catch {
    // IndexedDB unavailable (private mode in some browsers): start without a saved key.
  }
  // Outputs with a cast are scored in the browser; the studios add their
  // follow-up work (drift retries, Still first, finals' last frames, Director
  // shots waiting to continue from the shot before).
  setScorer(scoreJobOutputs);
  registerImageStudio();
  registerVideoStudio();
  registerRecastStudio();
  registerDirector();
  registerRemix();
  // Unfinished jobs pick up where they stopped. Polling needs a key, so jobs
  // are resumed again whenever one is added.
  void resumeJobs().catch(() => undefined);
  void resumeChains().catch(() => undefined);
  void resumeWaitingShots().catch(() => undefined);
  // Ask the browser not to evict the library (spec: Data model).
  void persistStorage();
  useKeyStore.subscribe((state, previous) => {
    if (state.location !== "none" && previous.location === "none") void resumeJobs().catch(() => undefined);
  });
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}

void bootstrap();
