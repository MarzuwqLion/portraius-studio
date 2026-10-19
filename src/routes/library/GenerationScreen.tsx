import { useParams } from "react-router";
import { Note, Screen } from "@/components/shell/Screen";

export function GenerationScreen() {
  const { generationId } = useParams();
  return (
    <Screen title="Take">
      <Note>Details, recipe and remix link for {generationId} appear here.</Note>
    </Screen>
  );
}
