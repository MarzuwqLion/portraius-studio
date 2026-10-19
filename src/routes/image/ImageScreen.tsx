import { useSearchParams } from "react-router";
import { Note, WorkScreen } from "@/components/shell/Screen";

export function ImageScreen() {
  const [params] = useSearchParams();
  const recipe = params.get("recipe");
  return (
    <WorkScreen
      title="Image"
      callSheet={<Note>{recipe ? `Preset ${recipe} loads here.` : "Prompt, cast and look controls go here."}</Note>}
      set={<p className="text-panel">Takes appear here.</p>}
    />
  );
}
