import { useRef, useState } from "react";
import { Link } from "react-router";
import { Screen } from "@/components/shell/Screen";
import { Badge } from "@/components/studio/Badge";
import { Take } from "@/components/studio/Take";
import { Button, buttonVariants } from "@/components/ui/button";
import { ELEMENT_TYPE_LABEL } from "@/lib/characters/element-sheet";
import { THUMB } from "@/lib/characters/format";
import { addImport, readImport, type PendingImport } from "@/lib/characters/manage";
import { useBlobUrl, useCharacters } from "@/lib/store/hooks";
import type { CharacterRecord } from "@/lib/types/records";

export function CharacterBadges({ record }: { record: CharacterRecord }) {
  return (
    <div className="flex flex-wrap gap-2">
      {record.kind === "element" ? (
        <Badge>{record.file.elementType && record.file.elementType !== "style" ? ELEMENT_TYPE_LABEL[record.file.elementType] : "Element"}</Badge>
      ) : (
        <Badge>{record.file.origin === "photos" ? "From photos" : "Designed"}</Badge>
      )}
      {record.file.consent && <Badge>Consent on file</Badge>}
      {record.locked && <Badge tone="warning">Locked</Badge>}
    </div>
  );
}

function CharacterCard({ record }: { record: CharacterRecord }) {
  const thumb = useBlobUrl(record.blobIds[THUMB]);
  return (
    <Link to={`/characters/${record.id}`} className="grid gap-3 rounded-media p-2 hover:bg-tint-hover">
      <Take src={thumb} alt={`${record.name}, front view`} aspect={record.kind === "element" && record.file.elementType === "location" ? "16 / 9" : "4 / 5"} />
      <div className="grid gap-2">
        <span className="text-panel font-semibold">{record.name}</span>
        <CharacterBadges record={record} />
      </div>
    </Link>
  );
}

function ImportButton({ onRead }: { onRead: (pending: PendingImport) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  return (
    <div className="grid justify-items-end gap-1">
      <Button variant="secondary" onClick={() => input.current?.click()}>
        Import file
      </Button>
      <input
        ref={input}
        type="file"
        accept=".portraius,.zip,application/zip"
        className="sr-only"
        aria-label="Import a .portraius file"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setError(undefined);
          readImport(file).then(onRead, (err: Error) => setError(err.message));
        }}
      />
      {error && (
        <p className="max-w-80 text-right text-control text-drift" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function ImportSummaryPanel({ pending, onDone }: { pending: PendingImport; onDone: () => void }) {
  const [saving, setSaving] = useState(false);
  const { summary } = pending;
  return (
    <section aria-label="Import" className="mb-8 grid max-w-[70ch] gap-3 border-y border-rule py-5">
      <h2 className="text-panel font-semibold">Import {summary.name}?</h2>
      <p className="text-body">
        {summary.kind === "element" ? "An element" : "A person"}, {summary.origin === "photos" ? "made from photos" : "designed from a description"}.{" "}
        {summary.consentAt
          ? `Consent recorded on ${new Date(summary.consentAt).toLocaleDateString()} by ${summary.consentMethod === "self-check" ? "webcam self-check" : summary.consentMethod}.`
          : summary.origin === "photos" && summary.kind === "person"
            ? "There's no consent record, so it imports locked: you can view it, but it can't be used in any generation."
            : ""}
      </p>
      {pending.replaces && <p className="text-body">This replaces {pending.replaces} in your vault.</p>}
      <div className="flex gap-3">
        <Button
          disabled={saving}
          onClick={() => {
            setSaving(true);
            void addImport(pending).finally(onDone);
          }}
        >
          {pending.replaces ? "Replace" : "Add to vault"}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </section>
  );
}

export function CharactersScreen() {
  const characters = useCharacters();
  const [pending, setPending] = useState<PendingImport>();
  const empty = characters !== undefined && characters.length === 0;

  return (
    <Screen
      title="Characters"
      actions={
        <div className="flex items-start gap-3">
          <ImportButton onRead={setPending} />
          {!empty && (
            <>
              <Link to="/characters/new?from=element" className={buttonVariants({ variant: "secondary" })}>
                Make an element
              </Link>
              <Link to="/characters/new" className={buttonVariants({ variant: "primary" })}>
                Make a character
              </Link>
            </>
          )}
        </div>
      }
    >
      {pending && <ImportSummaryPanel pending={pending} onDone={() => setPending(undefined)} />}
      {empty ? (
        <div className="flex min-h-80 flex-col items-center justify-center gap-6 rounded-media bg-seamless p-8 text-center text-on-seamless">
          <h2 className="font-display text-screen font-extrabold">Make your first character</h2>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/characters/new?from=photos" className={buttonVariants({ variant: "primary" })}>
              From your photos
            </Link>
            <Link to="/characters/new?from=text" className={buttonVariants({ variant: "secondary", className: "border-on-seamless text-on-seamless" })}>
              Design from a description
            </Link>
          </div>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {characters?.map((record) => (
            <li key={record.id}>
              <CharacterCard record={record} />
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
