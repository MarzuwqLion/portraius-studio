import { useSearchParams } from "react-router";
import { Note, WorkScreen } from "@/components/shell/Screen";

export function VideoScreen() {
  const [params] = useSearchParams();
  const from = params.get("from");
  return (
    <WorkScreen
      title="Video"
      callSheet={<Note>{from ? `Generation ${from} becomes the first frame.` : "Mode, prompt, cast and draft controls go here."}</Note>}
      set={<p className="text-panel">Drafts and finals play here.</p>}
    />
  );
}
