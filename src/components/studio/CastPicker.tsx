import { Link } from "react-router";
import { X } from "lucide-react";
import { Select } from "@/components/studio/fields";
import { Button } from "@/components/ui/button";
import { isUsable } from "@/lib/store/characters";
import { useCharacters } from "@/lib/store/hooks";
import { MAX_ELEMENTS, MAX_PEOPLE, nextSlot, type CastPick } from "@/lib/studio/cast";

// Characters for a generation, each on a {slot} the prompt can name. Locked
// imports never appear (spec: Import and export).
export function CastPicker({ id, value, onChange }: { id?: string; value: CastPick[]; onChange: (picks: CastPick[]) => void }) {
  const characters = useCharacters();
  const usable = (characters ?? []).filter(isUsable);
  const byId = new Map(usable.map((c) => [c.id, c]));
  const picked = value.filter((p) => byId.has(p.characterId));
  const people = picked.filter((p) => byId.get(p.characterId)?.kind === "person").length;
  const elements = picked.length - people;
  const choices = usable
    .filter((c) => !picked.some((p) => p.characterId === c.id))
    .filter((c) => (c.kind === "person" ? people < MAX_PEOPLE : elements < MAX_ELEMENTS))
    .map((c) => ({ value: c.id, label: c.kind === "person" ? c.name : `${c.name} (${c.file.elementType ?? "element"})` }));

  if (characters && !usable.length) {
    return (
      <p className="text-control text-ink-muted">
        No characters yet.{" "}
        <Link to="/characters/new" className="font-semibold text-accent-text underline underline-offset-4">
          Make one
        </Link>{" "}
        to put them in a shot.
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      {picked.length > 0 && (
        <ul className="grid gap-1">
          {picked.map((pick) => (
            <li key={pick.characterId} className="flex items-center justify-between gap-2 rounded-control border border-rule px-3 py-1.5">
              <span className="min-w-0 truncate text-control">
                <span className="font-semibold">{`{${pick.slot}}`}</span> {byId.get(pick.characterId)?.name}
              </span>
              <Button variant="ghost" size="icon" className="size-7" aria-label={`Remove ${byId.get(pick.characterId)?.name}`} onClick={() => onChange(value.filter((p) => p !== pick))}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {choices.length > 0 && (
        <Select
          id={id}
          value={undefined}
          placeholder={picked.length ? "Add another" : "Add a character"}
          options={choices}
          onChange={(id) => {
            const record = id ? byId.get(id) : undefined;
            if (record) onChange([...picked, { slot: nextSlot(record, picked.map((p) => p.slot)), characterId: record.id }]);
          }}
        />
      )}
    </div>
  );
}
