import { useRef, useState } from "react";
import { Link } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { Screen } from "@/components/shell/Screen";
import { Badge } from "@/components/studio/Badge";
import { Take } from "@/components/studio/Take";
import { Button, buttonVariants } from "@/components/ui/button";
import { draftThumbBlobId } from "@/lib/characters/create";
import { loadStartedDrafts, type WizardDraft } from "@/lib/characters/draft";
import { ELEMENT_TYPE_LABEL } from "@/lib/characters/element-sheet";
import { EXAMPLE_CHARACTERS, exampleThumbUrl, readExample } from "@/lib/characters/examples";
import { THUMB } from "@/lib/characters/format";
import { addImport, readImport, type PendingImport } from "@/lib/characters/manage";
import { useBlobUrl, useCharacters } from "@/lib/store/hooks";
import type { CharacterRecord } from "@/lib/types/records";
import { cn } from "@/lib/utils";
import { STEPS } from "./CharacterNewScreen";

export function CharacterBadges({ record }: { record: CharacterRecord }) {
  return (
    <div className="flex flex-wrap gap-2">
      {record.kind === "element" ? (
        <Badge>{record.file.elementType && record.file.elementType !== "style" ? ELEMENT_TYPE_LABEL[record.file.elementType] : "Element"}</Badge>
      ) : (
        <Badge>{record.file.origin === "photos" ? "From photos" : "Designed"}</Badge>
      )}
      {record.kind === "person" && record.file.appearance === "animated" && <Badge>Animated</Badge>}
      {record.file.consent && <Badge>Consent on file</Badge>}
      {record.locked && <Badge tone="warning">Locked</Badge>}
    </div>
  );
}

function CharacterCard({ record }: { record: CharacterRecord }) {
  const thumb = useBlobUrl(record.blobIds[THUMB]);
  return (
    <Link to={`/characters/${record.id}`} className="grid gap-3 rounded-media p-2 hover:bg-tint-hover">
      <Take
        src={thumb}
        alt={record.kind === "element" ? record.name : `${record.name}, front view`}
        aspect={record.kind === "element" && record.file.elementType === "location" ? "16 / 9" : "4 / 5"}
        fit={record.kind === "element" ? "cover" : "contain"}
      />
      <div className="grid gap-2">
        <span className="text-panel font-semibold">{record.name}</span>
        <CharacterBadges record={record} />
      </div>
    </Link>
  );
}

// A character or element still being made: the wizard keeps its draft, and
// this card takes the visitor back to the step they left.
function DraftCard({ draft }: { draft: WizardDraft }) {
  const thumbId = useLiveQuery(() => draftThumbBlobId(draft), [draft]);
  const thumb = useBlobUrl(thumbId);
  const steps = STEPS[draft.path];
  const step = Math.min(draft.step, steps.length - 1);
  const element = draft.path === "element";
  const name = draft.name.trim() || (element ? "Untitled element" : "Untitled character");
  return (
    <Link to={`/characters/new?from=${draft.path}`} className="grid gap-3 rounded-media border border-dashed border-rule p-2 hover:bg-tint-hover">
      <Take src={thumb} alt={`${name}, in progress`} aspect={element && draft.elementType === "location" ? "16 / 9" : "4 / 5"} fit={element ? "cover" : "contain"} />
      <div className="grid gap-2">
        <span className="text-panel font-semibold">{name}</span>
        <div className="flex flex-wrap gap-2">
          <Badge>In progress</Badge>
          {draft.path === "photos" && <Badge>From photos</Badge>}
          {draft.path === "text" && <Badge>Designed</Badge>}
          {draft.path !== "element" && draft.appearance === "animated" && <Badge>Animated</Badge>}
        </div>
        <span className="text-control text-ink-muted">
          Continue at step {step + 1} of {steps.length}: {steps[step]!.label}
        </span>
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
        Import .portraius
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

// Ready-made characters from public/examples/; one already in the
// vault isn't offered again.
function ExampleCharacters({ inVault }: { inVault: ReadonlySet<string> }) {
  const [adding, setAdding] = useState<string>();
  const [error, setError] = useState<string>();
  const left = EXAMPLE_CHARACTERS.filter((e) => !inVault.has(e.id));
  if (!left.length) return null;
  return (
    <section aria-labelledby="examples-heading" className="grid gap-4">
      <div className="grid gap-1">
        <h2 id="examples-heading" className="text-panel font-semibold">
          Examples
        </h2>
        <p className="text-control text-ink-muted">Ready-made characters to try. Adding one copies it into your vault.</p>
      </div>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {left.map((e) => (
          <li key={e.id} className="grid gap-3 p-2">
            <Take src={exampleThumbUrl(e)} alt={`${e.name}, front view`} aspect="4 / 5" fit="contain" />
            <div className="grid gap-2">
              <span className="text-panel font-semibold">{e.name}</span>
              <span className="text-control text-ink-muted">{e.note}</span>
              <Button
                variant="secondary"
                size="sm"
                className="justify-self-start"
                disabled={adding !== undefined}
                onClick={() => {
                  setAdding(e.id);
                  setError(undefined);
                  readExample(e)
                    .then(addImport)
                    .catch((err: Error) => setError(err.message))
                    .finally(() => setAdding(undefined));
                }}
              >
                {adding === e.id ? "Adding…" : "Add to vault"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {error && (
        <p className="text-control text-drift" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

type Tab = "person" | "element";
const TABS: { value: Tab; label: string }[] = [
  { value: "person", label: "People" },
  { value: "element", label: "Elements" },
];

// Cast and elements (spec: Decisions, October 21, item 14): people and
// elements on their own tabs, so a vault of props doesn't bury the cast.
export function CharactersScreen() {
  const characters = useCharacters();
  const drafts = useLiveQuery(loadStartedDrafts, []);
  const [pending, setPending] = useState<PendingImport>();
  const [tab, setTab] = useState<Tab>("person");
  const empty = characters !== undefined && characters.length === 0 && drafts !== undefined && drafts.length === 0;
  const shown = characters?.filter((c) => c.kind === tab) ?? [];
  const shownDrafts = drafts?.filter((d) => (d.path === "element") === (tab === "element")) ?? [];
  const count = (kind: Tab) => characters?.filter((c) => c.kind === kind).length ?? 0;
  const inVault = new Set(characters?.map((c) => c.id));

  return (
    <Screen
      title="Cast and elements"
      actions={
        <div className="flex flex-wrap items-start gap-3">
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
        <div className="grid gap-8">
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
          <ExampleCharacters inVault={inVault} />
        </div>
      ) : (
        <div className="grid gap-6">
          <div role="tablist" aria-label="Cast and elements" className="flex gap-1 border-b border-rule">
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                id={`tab-${t.value}`}
                aria-selected={tab === t.value}
                aria-controls="vault-panel"
                onClick={() => setTab(t.value)}
                className={cn("-mb-px border-b-2 px-3 py-2 text-body font-semibold", tab === t.value ? "border-accent text-ink" : "border-transparent text-ink-muted hover:text-ink")}
              >
                {t.label} <span className="text-control font-normal text-ink-muted">{count(t.value)}</span>
              </button>
            ))}
          </div>
          <div id="vault-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
            {shown.length || shownDrafts.length ? (
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {shownDrafts.map((draft) => (
                  <li key={draft.path}>
                    <DraftCard draft={draft} />
                  </li>
                ))}
                {shown.map((record) => (
                  <li key={record.id}>
                    <CharacterCard record={record} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex min-h-60 flex-col items-center justify-center gap-4 rounded-media bg-seamless p-8 text-center text-on-seamless">
                <p className="text-body">{tab === "person" ? "No people yet." : "No elements yet: outfits, props and locations you can put in any shot."}</p>
                <Link to={tab === "person" ? "/characters/new" : "/characters/new?from=element"} className={buttonVariants({ variant: "primary" })}>
                  {tab === "person" ? "Make a character" : "Make an element"}
                </Link>
              </div>
            )}
          </div>
          {tab === "person" && <ExampleCharacters inVault={inVault} />}
        </div>
      )}
    </Screen>
  );
}
