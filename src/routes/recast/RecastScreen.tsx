import { Note, WorkScreen } from "@/components/shell/Screen";

export function RecastScreen() {
  return (
    <WorkScreen
      title="Recast"
      callSheet={<Note>Clip upload, trim and mode controls go here.</Note>}
      set={<p className="text-panel">Original and recast play side by side here.</p>}
    />
  );
}
