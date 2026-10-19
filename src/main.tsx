import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppRoutes } from "@/routes/AppRoutes";
import { resumeJobs } from "@/lib/jobs/runner";
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
  // Unfinished jobs pick up where they stopped. Polling needs a key, so jobs
  // are resumed again whenever one is added.
  void resumeJobs().catch(() => undefined);
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
