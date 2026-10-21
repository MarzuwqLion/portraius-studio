import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { scenePieces, SLOT } from "@/lib/prompts/slots";
import { isUsable } from "@/lib/store/characters";
import { useCharacters, useCharacterThumbs } from "@/lib/store/hooks";
import { MAX_ELEMENTS, MAX_PEOPLE, nextSlot, type CastPick } from "@/lib/studio/cast";
import type { CharacterRecord } from "@/lib/types/records";
import { cn } from "@/lib/utils";

// The prompt with @mentions (spec: Decisions, October 21, item 6). Typing @
// offers the vault; a mention shows as a chip with the character's face. The
// value stays the scene as recipes and the compiler know it, with {lead}
// slots, so chips are only how the editor shows them.
//
// The editor owns its DOM: React renders the box once, and the text and chips
// inside are written here, so typing never fights a re-render for the caret.

const CHIP = "mx-0.5 inline-flex items-center gap-1 rounded-full border py-px pr-2 pl-0.5 align-baseline text-control font-semibold leading-5 select-none";
const CHIP_CAST = "border-accent bg-tint-hover text-ink";
const CHIP_EMPTY = "border-drift text-drift pl-2";
const FACE = "size-5 rounded-full object-cover bg-seamless";

interface ChipInfo {
  name?: string;
  face?: string;
}

function chipNode(slot: string, info: ChipInfo | undefined): HTMLElement {
  const chip = document.createElement("span");
  chip.contentEditable = "false";
  chip.dataset.mention = slot;
  chip.className = cn(CHIP, info?.name ? CHIP_CAST : CHIP_EMPTY);
  if (info?.name) {
    if (info.face) {
      const img = document.createElement("img");
      img.src = info.face;
      img.alt = "";
      img.className = FACE;
      chip.append(img);
    } else {
      const blank = document.createElement("span");
      blank.className = FACE;
      chip.append(blank);
    }
    chip.append(info.name);
    chip.title = `${info.name}, as ${slot}`;
  } else {
    chip.append(`@${slot}`);
    chip.title = `No one is cast as ${slot} yet`;
  }
  return chip;
}

// The scene the DOM holds: text as written, a chip as its {slot}.
function serialize(node: Node): string {
  let out = "";
  node.childNodes.forEach((child, i) => {
    if (child.nodeType === Node.TEXT_NODE) out += child.nodeValue ?? "";
    else if (child instanceof HTMLElement && child.dataset.mention) out += `{${child.dataset.mention}}`;
    else if (child instanceof HTMLElement && child.dataset.end !== undefined) return;
    else if (child.nodeName === "BR") out += "\n";
    // Chrome starts a new line as <div><br></div>: that's one newline, not two.
    else if (child.nodeName === "DIV" || child.nodeName === "P") out += (i > 0 ? "\n" : "") + (child.childNodes.length === 1 && child.firstChild?.nodeName === "BR" ? "" : serialize(child));
    else out += serialize(child);
  });
  return out;
}

function render(el: HTMLElement, value: string, chips: (slot: string) => ChipInfo | undefined): void {
  el.replaceChildren(...scenePieces(value).map((p) => ("slot" in p ? chipNode(p.slot, chips(p.slot)) : document.createTextNode(p.text))));
  // A trailing newline only shows with something after it.
  if (value.endsWith("\n")) {
    const end = document.createElement("br");
    end.dataset.end = "";
    el.append(end);
  }
}

// The caret as an offset into the serialized scene, and back.
function caretOffset(el: HTMLElement): number | undefined {
  const sel = window.getSelection();
  if (!sel?.focusNode || !el.contains(sel.focusNode)) return undefined;
  const range = document.createRange();
  range.setStart(el, 0);
  range.setEnd(sel.focusNode, sel.focusOffset);
  return serialize(range.cloneContents()).length;
}

function placeCaret(el: HTMLElement, offset: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  let left = offset;
  for (const child of el.childNodes) {
    const length = child.nodeType === Node.TEXT_NODE ? (child.nodeValue?.length ?? 0) : child instanceof HTMLElement && child.dataset.mention ? child.dataset.mention.length + 2 : 0;
    if (child.nodeType === Node.TEXT_NODE && left <= length) {
      range.setStart(child, left);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    if (left < length || (left === length && length > 0)) {
      range.setStartAfter(child);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    left -= length;
  }
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

interface Mention {
  node: Text;
  start: number; // the @
  end: number;
  query: string;
  top: number;
  left: number;
}

const KIND_LABEL = (r: CharacterRecord) => (r.kind === "person" ? "Person" : (r.file.elementType ?? "element").replace(/^./, (c) => c.toUpperCase()));

export function PromptEditor({
  id,
  value,
  onChange,
  cast,
  onAddCast,
  placeholder,
  rows = 4,
  maxLength = 2000,
  describedBy,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  cast: readonly CastPick[];
  onAddCast: (pick: CastPick) => void; // a mention of someone not cast yet adds them
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  describedBy?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const shown = useRef<string | null>(null); // the value the DOM holds
  const listId = useId();
  const characters = useCharacters();
  const faces = useCharacterThumbs();
  const [mention, setMention] = useState<Mention>();
  const [active, setActive] = useState(0);

  const usable = useMemo(() => (characters ?? []).filter(isUsable), [characters]);
  const bySlot = useMemo(() => {
    const byId = new Map(usable.map((c) => [c.id, c]));
    return new Map(cast.flatMap((p) => (byId.has(p.characterId) ? [[p.slot, byId.get(p.characterId)!] as const] : [])));
  }, [cast, usable]);
  const chipFor = (slot: string): ChipInfo | undefined => {
    const record = bySlot.get(slot);
    return record ? { name: record.name, face: faces.get(record.id) } : undefined;
  };
  // Chips redraw when who's cast, or their faces, change.
  const chipKey = [...bySlot].map(([slot, r]) => `${slot}:${r.name}:${faces.get(r.id) ?? ""}`).join("|");

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const focused = document.activeElement === el;
    const at = focused ? caretOffset(el) : undefined;
    render(el, value, chipFor);
    shown.current = value;
    if (at !== undefined) placeCaret(el, Math.min(at, value.length));
    // chipFor reads bySlot and faces, which chipKey stands for.
  }, [value === shown.current ? null : value, chipKey]);

  const people = cast.filter((p) => bySlot.get(p.slot)?.kind === "person").length;
  const elements = cast.filter((p) => bySlot.get(p.slot)?.kind === "element").length;
  const options = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return usable
      .filter((c) => !q || c.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) || c.name.toLowerCase().startsWith(q))
      .slice(0, 8)
      .map((c) => {
        const pick = cast.find((p) => p.characterId === c.id);
        const full = !pick && (c.kind === "person" ? people >= MAX_PEOPLE : elements >= MAX_ELEMENTS);
        return { record: c, pick, full };
      });
  }, [mention, usable, cast, people, elements]);

  function commit() {
    const el = box.current;
    if (!el) return;
    const text = serialize(el);
    if (text.length > maxLength) {
      const at = caretOffset(el);
      render(el, shown.current ?? "", chipFor);
      if (at !== undefined) placeCaret(el, Math.min(at, (shown.current ?? "").length));
      return;
    }
    shown.current = text;
    onChange(text);
    // Braces typed or pasted become chips straight away.
    const loose = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && new RegExp(SLOT.source, "i").test(n.nodeValue ?? ""));
    if (loose) {
      const at = caretOffset(el);
      render(el, text, chipFor);
      if (at !== undefined) placeCaret(el, at);
    }
    el.dataset.empty = String(text.length === 0);
  }

  function findMention() {
    const el = box.current;
    const sel = window.getSelection();
    const node = sel?.focusNode;
    if (!el || !sel || !node || node.nodeType !== Node.TEXT_NODE || !el.contains(node)) return setMention(undefined);
    const before = (node.nodeValue ?? "").slice(0, sel.focusOffset);
    const m = /(?:^|\s)@([^\s@{}]{0,30})$/u.exec(before);
    if (!m) return setMention(undefined);
    const range = document.createRange();
    range.setStart(node, sel.focusOffset);
    const caret = range.getBoundingClientRect();
    const frame = el.getBoundingClientRect();
    setMention({ node: node as Text, start: sel.focusOffset - m[1]!.length - 1, end: sel.focusOffset, query: m[1]!, top: caret.bottom - frame.top + 4, left: Math.max(0, Math.min(caret.left - frame.left, frame.width - 240)) });
    setActive(0);
  }

  function choose(index: number) {
    const el = box.current;
    const option = options[index];
    if (!el || !mention || !option || option.full) return;
    const slot = option.pick?.slot ?? nextSlot(option.record, cast.map((p) => p.slot));
    if (!option.pick) onAddCast({ slot, characterId: option.record.id });
    const range = document.createRange();
    range.setStart(mention.node, mention.start);
    range.setEnd(mention.node, Math.min(mention.end, mention.node.length));
    range.deleteContents();
    const space = document.createTextNode(" ");
    range.insertNode(space);
    range.insertNode(chipNode(slot, { name: option.record.name, face: faces.get(option.record.id) }));
    const sel = window.getSelection();
    const after = document.createRange();
    after.setStart(space, 1);
    after.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(after);
    setMention(undefined);
    commit();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (mention && options.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => (a + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
        return;
      }
      if ((e.key === "Enter" || e.key === "Tab") && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        choose(active);
        return;
      }
    }
    if (e.key === "Escape" && mention) {
      e.preventDefault();
      setMention(undefined);
      return;
    }
    if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // A plain newline, not the browser's own <div>.
      e.preventDefault();
      document.execCommand("insertText", false, "\n");
    }
  }

  useEffect(() => {
    if (box.current) box.current.dataset.empty = String(value.length === 0);
  }, [value]);

  return (
    <div className="relative">
      <div
        ref={box}
        id={id}
        role="textbox"
        aria-multiline="true"
        aria-labelledby={id ? `${id}-label` : undefined}
        aria-describedby={describedBy}
        aria-autocomplete="list"
        aria-expanded={Boolean(mention && options.length)}
        aria-controls={mention ? listId : undefined}
        aria-activedescendant={mention && options[active] ? `${listId}-${active}` : undefined}
        contentEditable
        suppressContentEditableWarning
        spellCheck
        data-placeholder={placeholder}
        className="prompt-editor w-full overflow-auto rounded-control border border-rule bg-proof p-3 text-body whitespace-pre-wrap text-ink"
        style={{ minHeight: `calc(${rows} * 1.5em + 1.5rem)`, maxHeight: "16rem" }}
        onInput={() => {
          commit();
          findMention();
        }}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") && findMention()}
        onClick={findMention}
        onBlur={() => setMention(undefined)}
        onPaste={(e) => {
          e.preventDefault();
          document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
        }}
        onDrop={(e) => e.preventDefault()}
      />
      {mention && (
        <ul id={listId} role="listbox" aria-label="Characters in your vault" className="absolute z-20 w-60 rounded-control border border-rule bg-proof p-1 text-ink" style={{ top: mention.top, left: mention.left }}>
          {options.length === 0 && <li className="px-2 py-1.5 text-control text-ink-muted">{usable.length ? "No one by that name." : "Your vault is empty. Make a character first."}</li>}
          {options.map((o, i) => (
            <li
              key={o.record.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              aria-disabled={o.full}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(i);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn("flex cursor-pointer items-center gap-2 rounded-[4px] px-2 py-1.5", i === active && "bg-tint-active", o.full && "cursor-not-allowed opacity-60")}
            >
              {faces.get(o.record.id) ? <img src={faces.get(o.record.id)} alt="" className="size-7 rounded-full object-cover" /> : <span className="size-7 rounded-full bg-seamless" />}
              <span className="grid min-w-0">
                <span className="truncate text-control font-semibold">{o.record.name}</span>
                <span className="text-control text-ink-muted">{o.full ? "Cast is full" : o.pick ? "In the cast" : KIND_LABEL(o.record)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// A stored prompt, read-only, with each slot shown as its mention: "@lead".
export function PromptText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      {scenePieces(text).map((p, i) =>
        "slot" in p ? (
          <mark key={i} className="rounded-control bg-tint-hover px-1 font-semibold text-ink">
            @{p.slot}
          </mark>
        ) : (
          p.text
        ),
      )}
    </span>
  );
}
