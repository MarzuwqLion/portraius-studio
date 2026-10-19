import { useParams } from "react-router";
import { Note, Screen } from "@/components/shell/Screen";

export function CharacterDetailScreen() {
  const { id } = useParams();
  return (
    <Screen title="Character">
      <Note>Sheet, views, redraw and export for character {id} are built in the next milestone.</Note>
    </Screen>
  );
}
