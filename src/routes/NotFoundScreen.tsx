import { Link } from "react-router";
import { buttonVariants } from "@/components/ui/button";
import { Note, Screen } from "@/components/shell/Screen";

export function NotFoundScreen() {
  return (
    <Screen title="Nothing here">
      <Note>This link doesn't match a screen.</Note>
      <Link to="/" className={buttonVariants({ variant: "secondary", className: "mt-6" })}>
        Go to the start
      </Link>
    </Screen>
  );
}
