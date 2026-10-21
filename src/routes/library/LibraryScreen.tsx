import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { Screen } from "@/components/shell/Screen";
import { Field, Select } from "@/components/studio/fields";
import { ScoreBadge } from "@/components/studio/Take";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { Band } from "@/lib/identity/score";
import { exportZip, libraryGenerations, matches, saveFile, storageUse, type LibraryFilter } from "@/lib/library/library";
import { REGISTRY } from "@/lib/registry/models";
import { useBlobUrl, useCharacters } from "@/lib/store/hooks";
import { scenePieces } from "@/lib/prompts/slots";
import { castOfTake } from "@/lib/studio/cast";
import type { CharacterRecord, Generation } from "@/lib/types/records";

const TYPES: { value: Generation["type"]; label: string }[] = [
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
  { value: "recast", label: "Recasts" },
  { value: "scene", label: "Scenes" },
];
const BANDS: { value: Band | "unscored"; label: string }[] = [
  { value: "match", label: "Strong (80 and up)" },
  { value: "check", label: "Review (60 to 79)" },
  { value: "drift", label: "Drifted (under 60)" },
  { value: "unscored", label: "Not scored" },
];

// A take's prompt in words, for its alt text: a slot whose cast is known reads
// as their name, any other as @slot.
function promptWords(generation: Generation, characters: readonly CharacterRecord[] | undefined): string {
  const slots = castOfTake(generation.prompt ?? "", generation.characterIds);
  return scenePieces(generation.prompt ?? "")
    .map((p) => ("slot" in p ? (characters?.find((c) => c.id === slots[p.slot])?.name ?? `@${p.slot}`) : p.text))
    .join("");
}

function Print({ generation, alt, selecting, selected, onToggle }: { generation: Generation; alt: string; selecting: boolean; selected: boolean; onToggle: () => void }) {
  const still = generation.assets.find((a) => a.kind === "image") ?? generation.assets.find((a) => a.kind === "frame");
  const video = generation.assets.find((a) => a.kind === "video");
  const stillUrl = useBlobUrl(still?.blobId);
  const videoUrl = useBlobUrl(still ? undefined : video?.blobId);
  const media = stillUrl ? (
    <img src={stillUrl} alt={alt || generation.type} className="develop block w-full" />
  ) : videoUrl ? (
    <video src={videoUrl} muted playsInline preload="metadata" className="block w-full" aria-label={alt || "Video"} />
  ) : (
    <span className="block aspect-square w-full" />
  );
  const body = (
    <>
      <span className="relative block overflow-hidden rounded-media border border-rule bg-seamless">
        {media}
        {video && <span className="absolute top-2 left-2 rounded-control bg-proof px-2 py-0.5 text-control font-semibold text-ink">Video</span>}
      </span>
      <span className="mt-2 flex items-center justify-between gap-2">
        {generation.scoreNote === "stylised" ? (
          <span className="text-control text-on-seamless">Stylised</span>
        ) : generation.identityScore !== undefined ? (
          <ScoreBadge score={generation.identityScore} info={false} />
        ) : (
          <span />
        )}
      </span>
    </>
  );
  return (
    <li className="mb-6 break-inside-avoid">
      {selecting ? (
        <label className="block cursor-pointer">
          <span className="mb-2 flex items-center gap-2 text-control text-on-seamless">
            <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`Select ${alt || generation.type}`} />
            Select
          </span>
          {body}
        </label>
      ) : (
        <Link to={`/library/${generation.id}`} className="block">
          {body}
        </Link>
      )}
    </li>
  );
}

export function LibraryScreen() {
  const all = useLiveQuery(libraryGenerations, []);
  const characters = useCharacters();
  const [filter, setFilter] = useState<LibraryFilter>({});
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [storage, setStorage] = useState<{ used: number; quota: number } | null>(null);

  useEffect(() => {
    void storageUse().then(setStorage);
  }, [all?.length]);

  const shown = (all ?? []).filter((g) => matches(g, filter));
  const models = REGISTRY.filter((m) => all?.some((g) => g.modelId === m.id));
  const nearlyFull = storage && storage.quota > 0 && storage.used / storage.quota > 0.8;
  const set = (patch: Partial<LibraryFilter>) => setFilter((f) => ({ ...f, ...patch }));

  async function exportSelected() {
    setExporting(true);
    try {
      saveFile(await exportZip([...selected]),`portraius-library-${new Date().toISOString().slice(0, 10)}.zip`);
      setSelecting(false);
      setSelected(new Set());
    } finally {
      setExporting(false);
    }
  }

  return (
    <Screen
      title="Library"
      actions={
        all && all.length > 0 ? (
          selecting ? (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => (setSelecting(false), setSelected(new Set()))}>
                Cancel
              </Button>
              <Button variant="secondary" onClick={() => setSelected(new Set(shown.map((g) => g.id)))}>
                Select all shown
              </Button>
              <Button onClick={() => void exportSelected()} disabled={!selected.size || exporting}>
                {exporting ? "Exporting" : `Export ${selected.size} as zip`}
              </Button>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setSelecting(true)}>
              Select to export
            </Button>
          )
        ) : null
      }
    >
      {nearlyFull && (
        <p className="mb-4 max-w-[70ch] text-body text-drift" role="status">
          Storage is nearly full. Export older takes and delete them to make room.
        </p>
      )}
      <div className="mb-6 grid max-w-5xl grid-cols-2 gap-3 md:grid-cols-5">
        <Field label="Type">{(id) => <Select id={id} value={filter.type} placeholder="All" options={TYPES} onChange={(type) => set({ type })} />}</Field>
        <Field label="Character">
          {(id) => <Select id={id} value={filter.characterId} placeholder="Anyone" options={(characters ?? []).map((c) => ({ value: c.id, label: c.name }))} onChange={(characterId) => set({ characterId })} />}
        </Field>
        <Field label="Model">{(id) => <Select id={id} value={filter.modelId} placeholder="Any" options={models.map((m) => ({ value: m.id, label: m.label }))} onChange={(modelId) => set({ modelId })} />}</Field>
        <Field label="Score">{(id) => <Select id={id} value={filter.band} placeholder="Any" options={BANDS} onChange={(band) => set({ band })} />}</Field>
        <Field label="When">
          {(id) => (
            <Select
              id={id}
              value={filter.since}
              placeholder="Any time"
              options={[
                { value: "day", label: "Today" },
                { value: "week", label: "This week" },
              ]}
              onChange={(since) => set({ since })}
            />
          )}
        </Field>
      </div>
      {all && all.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-media bg-seamless p-8 text-center text-on-seamless">
          <p className="font-display text-screen font-extrabold">Nothing saved yet</p>
          <div className="flex gap-3">
            <Link to="/image" className={buttonVariants({ variant: "primary" })}>
              Make an image
            </Link>
            <Link to="/video" className={buttonVariants({ variant: "secondary", className: "border-on-seamless text-on-seamless" })}>
              Make a clip
            </Link>
          </div>
        </div>
      ) : (
        <div className="rounded-media bg-seamless p-6">
          {shown.length === 0 && all ? <p className="text-body text-on-seamless">Nothing matches these filters.</p> : null}
          <ul className="columns-2 gap-6 md:columns-3 xl:columns-4">
            {shown.map((g) => (
              <Print
                key={g.id}
                generation={g}
                alt={promptWords(g, characters)}
                selecting={selecting}
                selected={selected.has(g.id)}
                onToggle={() =>
                  setSelected((s) => {
                    const next = new Set(s);
                    if (next.has(g.id)) next.delete(g.id);
                    else next.add(g.id);
                    return next;
                  })
                }
              />
            ))}
          </ul>
        </div>
      )}
    </Screen>
  );
}
