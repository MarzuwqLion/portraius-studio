import { useParams } from "react-router";
import { Note, WorkScreen } from "@/components/shell/Screen";

export function DirectorScreen() {
  const { sceneId } = useParams();
  return (
    <div className="flex h-full flex-col">
      <p className="border-b border-rule px-6 py-3 text-control md:hidden">Director works best on a desktop screen.</p>
      <div className="min-h-0 flex-1">
        <WorkScreen
          title="Director"
          callSheet={<Note>{sceneId ? `Scene ${sceneId}: scene card and shot list go here.` : "Scene card and shot list go here."}</Note>}
          set={<p className="text-panel">Anchors and the timeline strip appear here.</p>}
        />
      </div>
    </div>
  );
}
