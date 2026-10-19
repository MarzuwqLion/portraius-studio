import { useSearchParams } from "react-router";
import { Note, Screen } from "@/components/shell/Screen";

export function RemixScreen() {
  const [params] = useSearchParams();
  return (
    <Screen title="Remix">
      <Note>
        {params.get("r")
          ? "This recipe opens here, with a slot for each of your characters."
          : "Open a remix link to fill its slots with your own characters."}
      </Note>
    </Screen>
  );
}
