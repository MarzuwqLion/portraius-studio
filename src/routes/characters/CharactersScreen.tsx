import { Link } from "react-router";
import { buttonVariants } from "@/components/ui/button";
import { Screen } from "@/components/shell/Screen";

export function CharactersScreen() {
  return (
    <Screen title="Characters">
      <div className="flex min-h-80 flex-col items-center justify-center gap-6 rounded-media bg-seamless p-8 text-center text-on-seamless">
        <h2 className="font-display text-screen font-extrabold">Make your first character</h2>
        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/characters/new?from=photos" className={buttonVariants({ variant: "primary" })}>
            From your photos
          </Link>
          <Link
            to="/characters/new?from=text"
            className={buttonVariants({ variant: "secondary", className: "border-on-seamless text-on-seamless" })}
          >
            Design from a description
          </Link>
        </div>
      </div>
    </Screen>
  );
}
