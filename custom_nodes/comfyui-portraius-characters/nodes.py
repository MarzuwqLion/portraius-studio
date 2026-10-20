"""Portraius Studio's characters in ComfyUI (spec: ComfyUI workflows and custom node pack).

A character made in the app is one .portraius file. These nodes open it, build the same prompt the
app sends with it, and score a result against the character's own face:

- Load Portraius Character: the file's sheet, views and photos. A person made from photos needs
  their consent record, as in the app.
- Character Prompt: the app's prompt compiler, ported, plus the reference images it names, ready
  for the Nano Banana 2.1 partner node.
- Identity Score: 0 to 100 on the app's scale, from FaceNet instead of the app's face-api.
"""

from __future__ import annotations

import os

import numpy as np
import torch
from PIL import Image

from comfy_api.latest import ComfyExtension, io, ui

from .portraius.character import Character, CharacterFileError, read_character
from .portraius.compile import CAMERA, LOOKS, CastMember, compile_image_prompt, slots_in

PortraiusCharacter = io.Custom("PORTRAIUS_CHARACTER")

NANO_BANANA = "vertexai/gemini-nano-banana-2.1"
CHARACTERS_FOLDER = "characters"
NONE = "none"
MAX_SIDE = 2048
# The grey the sheets are drawn on, behind references of different shapes.
STUDIO_GREY = (128, 128, 128)

# Camera controls the node offers for a still, by label, as the app shows them.
STILL_GROUPS = ["size", "angle", "lens", "aperture", "lighting"]


def _input_dir() -> str:
    import folder_paths

    return folder_paths.get_input_directory()


def _characters_dir() -> str:
    path = os.path.join(_input_dir(), CHARACTERS_FOLDER)
    os.makedirs(path, exist_ok=True)
    return path


def character_files() -> list[str]:
    try:
        return sorted(f for f in os.listdir(_characters_dir()) if f.lower().endswith(".portraius"))
    except OSError:
        return []


def _fit(image: Image.Image) -> Image.Image:
    scale = MAX_SIDE / max(image.size)
    return image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS) if scale < 1 else image


def to_batch(images: list[Image.Image]) -> torch.Tensor:
    """Images as one IMAGE batch: each centred on Studio grey in a frame big enough for all of them."""
    fitted = [_fit(img.convert("RGB")) for img in images]
    width = max(img.width for img in fitted)
    height = max(img.height for img in fitted)
    frames = []
    for img in fitted:
        canvas = Image.new("RGB", (width, height), STUDIO_GREY)
        canvas.paste(img, ((width - img.width) // 2, (height - img.height) // 2))
        frames.append(torch.from_numpy(np.asarray(canvas, dtype=np.float32) / 255.0))
    return torch.stack(frames)


def to_pils(batch: torch.Tensor) -> list[Image.Image]:
    return [Image.fromarray(np.clip(frame.cpu().numpy() * 255.0, 0, 255).astype(np.uint8)) for frame in batch]


# ---- Load Portraius Character ----


class LoadPortraiusCharacter(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        files = character_files()
        return io.Schema(
            node_id="PortraiusLoadCharacter",
            display_name="Load Portraius Character",
            category="Portraius",
            description="Opens a .portraius character file from ComfyUI/input/characters. A person made from photos needs their consent record, as in the app.",
            inputs=[io.Combo.Input("character", options=files or ["(add .portraius files to input/characters)"], tooltip="Files in ComfyUI/input/characters")],
            outputs=[
                PortraiusCharacter.Output(display_name="character"),
                io.Image.Output(display_name="sheet"),
                io.Image.Output(display_name="views", tooltip="Front, three-quarter, profile and full body"),
                io.Image.Output(display_name="photos", tooltip="The source photos; a designed character's front view"),
                io.String.Output(display_name="name"),
                io.String.Output(display_name="description"),
            ],
        )

    @classmethod
    def fingerprint_inputs(cls, character):
        path = os.path.join(_characters_dir(), character)
        return os.path.getmtime(path) if os.path.exists(path) else character

    @classmethod
    def execute(cls, character) -> io.NodeOutput:
        path = os.path.join(_characters_dir(), os.path.basename(character))
        if not os.path.isfile(path):
            raise ValueError(f"Put a .portraius file in {_characters_dir()} and pick it here.")
        try:
            loaded = read_character(path)
        except CharacterFileError as err:
            raise ValueError(f"{character}: {err}") from err
        if loaded.locked:
            raise ValueError(
                f"{loaded.name} was made from photos but has no consent record, so it can't be used, as in the app. "
                "The person in the photos can make their own character and send the file."
            )
        photos = loaded.photo_paths() or [loaded.data["sheet"]["views"]["front"]]
        return io.NodeOutput(
            loaded,
            to_batch([loaded.image(loaded.sheet_path)]),
            to_batch([loaded.image(p) for p in loaded.view_paths()]),
            to_batch([loaded.image(p) for p in photos]),
            loaded.name,
            loaded.description,
        )


# ---- Character Prompt ----


def _labels(group: str) -> list[str]:
    return [NONE, *[o["label"] for o in CAMERA[group]]]


def _id_for(group: str, label: str) -> str | None:
    return next((o["id"] for o in CAMERA[group] if o["label"] == label), None)


def assign_slots(characters: list[Character]) -> list[tuple[str, Character]]:
    """Slots the way the app's cast picker gives them: people are lead, second, third; elements are
    named for their type (outfit, prop, location, style), numbered when repeated."""
    used: list[str] = []
    slots = []
    for c in characters:
        if c.kind == "person":
            slot = next((s for s in ["lead", "second", "third"] if s not in used), f"person{len(used) + 1}")
        else:
            base = c.data.get("elementType") or "element"
            slot, n = base, 2
            while slot in used:
                slot, n = f"{base}{n}", n + 1
        used.append(slot)
        slots.append((slot, c))
    return slots


class PortraiusCharacterPrompt(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="PortraiusCharacterPrompt",
            display_name="Character Prompt",
            category="Portraius",
            description=(
                "Builds the prompt Portraius Studio sends Nano Banana 2.1 for a still: which reference image is who, "
                "the identity lock, the scene, the camera and the look. People are {lead}, {second} and {third} in the "
                "scene; elements are named for their type, like {outfit}. Wire references into the Nano Banana 2.1 node."
            ),
            inputs=[
                io.String.Input("scene", multiline=True, default="{lead} reading in a corner booth of a late-night diner"),
                PortraiusCharacter.Input("character_1"),
                PortraiusCharacter.Input("character_2", optional=True),
                PortraiusCharacter.Input("character_3", optional=True),
                PortraiusCharacter.Input("character_4", optional=True),
                *[io.Combo.Input(group, options=_labels(group), default=NONE, optional=True) for group in STILL_GROUPS],
                io.Combo.Input("look", options=[NONE, *[l["label"] for l in LOOKS]], default=NONE, optional=True),
            ],
            outputs=[
                io.String.Output(display_name="prompt"),
                io.Image.Output(display_name="references", tooltip="In the order the prompt names them, on Studio grey"),
                io.String.Output(display_name="cast", tooltip="Who each slot is"),
            ],
        )

    @classmethod
    def execute(cls, scene, character_1, character_2=None, character_3=None, character_4=None, look=NONE, **camera_labels) -> io.NodeOutput:
        characters = [c for c in [character_1, character_2, character_3, character_4] if c is not None]
        people = sum(1 for c in characters if c.kind == "person")
        if people > 3:
            raise ValueError("A generation takes up to 3 people, as in the app.")
        cast = assign_slots(characters)
        named = {slot for slot, _ in cast}
        unknown = [s for s in slots_in(scene) if s not in named]
        if unknown:
            raise ValueError(f"The scene names {', '.join('{' + s + '}' for s in unknown)}, but the cast is {', '.join('{' + s + '}' for s in named)}.")

        members, images = [], []
        for slot, c in cast:
            refs = c.reference_paths()
            members.append(CastMember(slot=slot, name=c.name, kind=c.kind, references=[kind for kind, _ in refs], description=c.description))
            images.extend(c.image(path) for _, path in refs)

        camera = {g: _id_for(g, camera_labels.get(g, NONE)) for g in STILL_GROUPS}
        camera = {g: v for g, v in camera.items() if v}
        chosen = next((l["id"] for l in LOOKS if l["label"] == look), None)
        if chosen:
            camera["look"] = chosen
        prompt = compile_image_prompt(scene, members, camera, NANO_BANANA)
        roster = "\n".join(f"{{{slot}}} = {c.name}" for slot, c in cast)
        return io.NodeOutput(prompt, to_batch(images), roster, ui=ui.PreviewText(prompt))


# ---- Identity Score ----

_scorer = None


def _face_scorer():
    global _scorer
    if _scorer is None:
        import comfy.model_management
        import folder_paths

        from .portraius.identity import FaceScorer, ensure_weights

        weights = ensure_weights(os.path.join(folder_paths.models_dir, "facenet"))
        _scorer = FaceScorer(weights, comfy.model_management.get_torch_device())
    return _scorer


class PortraiusIdentityScore(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="PortraiusIdentityScore",
            display_name="Identity Score",
            category="Portraius",
            description=(
                "How closely the faces in an image (or the frames of a video) match a character, 0 to 100 on the app's scale: "
                "80 and up a strong match, 60 to 79 check, under 60 drift. Uses FaceNet, so scores won't match the app's exactly."
            ),
            is_output_node=True,
            inputs=[io.Image.Input("image", tooltip="One image, or a batch of video frames"), PortraiusCharacter.Input("character")],
            outputs=[io.Float.Output(display_name="score"), io.String.Output(display_name="report")],
        )

    @classmethod
    def execute(cls, image, character) -> io.NodeOutput:
        if character.kind != "person":
            raise ValueError(f"{character.name} is an element: there's no face to score.")
        score, report = _face_scorer().score_images(to_pils(image), character)
        return io.NodeOutput(score, report, ui=ui.PreviewText(report))


class PortraiusExtension(ComfyExtension):
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [LoadPortraiusCharacter, PortraiusCharacterPrompt, PortraiusIdentityScore]


async def comfy_entrypoint() -> PortraiusExtension:
    return PortraiusExtension()
