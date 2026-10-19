import { Route, Routes } from "react-router";
import { AppShell } from "@/components/shell/AppShell";
import { CharacterDetailScreen } from "./characters/CharacterDetailScreen";
import { CharacterNewScreen } from "./characters/CharacterNewScreen";
import { CharactersScreen } from "./characters/CharactersScreen";
import { DirectorScreen } from "./director/DirectorScreen";
import { FirstRunScreen } from "./first-run/FirstRunScreen";
import { ImageScreen } from "./image/ImageScreen";
import { GenerationScreen } from "./library/GenerationScreen";
import { LibraryScreen } from "./library/LibraryScreen";
import { NotFoundScreen } from "./NotFoundScreen";
import { RecastScreen } from "./recast/RecastScreen";
import { RemixScreen } from "./remix/RemixScreen";
import { SettingsScreen } from "./settings/SettingsScreen";
import { TourScreen } from "./tour/TourScreen";
import { VideoScreen } from "./video/VideoScreen";

// Contracts: Routes and screens (HashRouter).
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<FirstRunScreen />} />
        <Route path="characters" element={<CharactersScreen />} />
        <Route path="characters/new" element={<CharacterNewScreen />} />
        <Route path="characters/:id" element={<CharacterDetailScreen />} />
        <Route path="image" element={<ImageScreen />} />
        <Route path="video" element={<VideoScreen />} />
        <Route path="recast" element={<RecastScreen />} />
        <Route path="director" element={<DirectorScreen />} />
        <Route path="director/:sceneId" element={<DirectorScreen />} />
        <Route path="library" element={<LibraryScreen />} />
        <Route path="library/:generationId" element={<GenerationScreen />} />
        <Route path="remix" element={<RemixScreen />} />
        <Route path="tour" element={<TourScreen />} />
        <Route path="settings" element={<SettingsScreen />} />
        <Route path="*" element={<NotFoundScreen />} />
      </Route>
    </Routes>
  );
}
