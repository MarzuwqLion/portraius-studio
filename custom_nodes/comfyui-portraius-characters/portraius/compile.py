"""A Python port of Portraius Studio's prompt compiler (src/lib/prompts/compile.ts and camera.ts).

A graph built from a .portraius file sends the same words the app does: reference legend, identity
lock, descriptions, scene, camera and look, realism. tests/test_compile.py checks the port against
the app's own output (tests/compile_cases.json, written by npm run nodepack).
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field

_HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(_HERE, "presets.json"), encoding="utf-8") as _f:
    _PRESETS = json.load(_f)

# Camera options by group, and the looks, as the app ships them (presets/camera, presets/looks).
CAMERA: dict[str, list[dict]] = _PRESETS["camera"]
LOOKS: list[dict] = _PRESETS["looks"]

# Shot settings first, then the film-level ones (camera.ts).
ORDER = ["size", "angle", "lens", "aperture", "movement", "lighting", "body", "era", "genre", "pacing"]

REALISM = "Natural skin texture with visible pores, real lens imperfections."

# Cast slots in a scene, like {lead} (slots.ts).
SLOT = re.compile(r"\{([a-z][a-z0-9_-]*)\}", re.IGNORECASE)


@dataclass
class CastMember:
    slot: str  # "lead", written {lead} in the scene
    name: str
    kind: str  # "person" or "element"
    references: list[str] = field(default_factory=list)  # "sheet", "photo" or "front", in sending order
    description: str = ""


def camera_option(group: str, option_id: str | None) -> dict | None:
    if not option_id:
        return None
    return next((o for o in CAMERA.get(group, []) if o["id"] == option_id), None)


def look(look_id: str | None) -> dict | None:
    if not look_id:
        return None
    return next((l for l in LOOKS if l["id"] == look_id), None)


def camera_phrases(selection: dict, model_id: str | None = None) -> list[str]:
    phrases = []
    for group in ORDER:
        option = camera_option(group, selection.get(group))
        if not option:
            continue
        override = (option.get("overrides") or {}).get(model_id) if model_id else None
        phrase = override if override is not None else option["phrase"]
        if phrase:
            phrases.append(phrase)
    chosen = look(selection.get("look"))
    if chosen and chosen.get("phrase"):
        phrases.append(chosen["phrase"])
    return phrases


def is_stylised(selection: dict) -> bool:
    chosen = look(selection.get("look"))
    return bool(chosen and chosen.get("stylised"))


def role(slot: str) -> str:
    return slot.upper()


def slots_in(scene: str) -> list[str]:
    """The slots a scene names, in order of first use."""
    seen: list[str] = []
    for match in SLOT.finditer(scene):
        slot = match.group(1).lower()
        if slot not in seen:
            seen.append(slot)
    return seen


def sentence(text: str) -> str:
    t = text.strip()
    if not t:
        return ""
    capital = t[0].upper() + t[1:]
    return capital if re.search(r"[.!?]$", capital) else f"{capital}."


def _list_images(indexes: list[int]) -> str:
    if len(indexes) == 1:
        return f"image {indexes[0]}"
    return f"images {', '.join(str(i) for i in indexes[:-1])} and {indexes[-1]}"


def _legend_line(n: int, ref: str, member: CastMember, prefix: str) -> str:
    who = role(member.slot)
    if member.kind == "element":
        return f"{prefix} {n} is the {who}."
    if ref == "sheet":
        return f"{prefix} {n} is the reference sheet for {who} ({member.name})."
    if ref == "photo":
        return f"{prefix} {n} is a photo of {who}."
    return f"{prefix} {n} is a front portrait of {who}."


def _cast_block(cast: list[CastMember], first: int, prefix: str) -> tuple[list[str], list[str]]:
    n = first
    legend: list[str] = []
    locks: list[str] = []
    for member in cast:
        indexes = []
        for ref in member.references:
            legend.append(_legend_line(n, ref, member, prefix))
            indexes.append(n)
            n += 1
        if member.kind == "person" and indexes:
            locks.append(
                f"Keep {role(member.slot)}'s exact face, skin tone, skin texture and hair from {_list_images(indexes)}. "
                "Do not beautify or change their age."
            )
    return legend, locks


def _descriptions(cast: list[CastMember]) -> list[str]:
    return [f"{role(m.slot)}: {sentence(m.description)}" for m in cast if m.description and m.description.strip()]


def compile_image_prompt(scene: str, cast: list[CastMember], camera: dict, model_id: str, editing: bool = False) -> str:
    """The app's compileImagePrompt: what Nano Banana 2.1 is sent for a still."""
    legend = ["Image 1 is the image to edit."] if editing else []
    cast_legend, locks = _cast_block(cast, 2 if editing else 1, "Image")
    has_person = any(m.kind == "person" for m in cast)
    parts = [
        " ".join(legend + cast_legend),
        " ".join(locks),
        " ".join(_descriptions(cast)),
        sentence(SLOT.sub(lambda m: role(m.group(1)), scene)),
        sentence(", ".join(camera_phrases(camera, model_id))),
        # Skin and lens realism only where a person can be in the shot.
        "" if is_stylised(camera) or not (editing or has_person) else REALISM,
    ]
    return "\n".join(p for p in parts if p)
