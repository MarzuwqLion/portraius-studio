"""Reads .portraius character files, the app's own format (spec: Data model, Character file layout).

A .portraius file is a zip: character.json, the source photos, the turnaround sheet and its views,
identity/face.json (the app's face descriptors) and, for a person made from photos, the consent
record in consent/consent.json. The checks follow the app's importer (src/lib/characters/format.ts).
"""

from __future__ import annotations

import io
import json
import re
import zipfile
from dataclasses import dataclass, field
from datetime import datetime

from PIL import Image

CHARACTER_JSON = "character.json"
FACE_JSON = "identity/face.json"
CONSENT_JSON = "consent/consent.json"

MAX_ZIP_BYTES = 200 * 1024 * 1024
MAX_FILE_BYTES = 50 * 1024 * 1024
MAX_ENTRIES = 40

# Every path a .portraius file may hold.
PATHS = [
    re.compile(r"^photos/\d{3}\.jpg$"),
    re.compile(r"^sheet/(turnaround|front|three-quarter|profile|full-body|expressions)\.png$"),
    re.compile(r"^thumb\.jpg$"),
    re.compile(r"^consent/check\.webm$"),
]
JSON_PATHS = {CHARACTER_JSON, FACE_JSON, CONSENT_JSON}

VIEWS = ["front", "threeQuarter", "profile", "fullBody"]


class CharacterFileError(ValueError):
    """The file isn't a .portraius character this pack can use."""


def _date(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        return True
    except ValueError:
        return False


@dataclass
class Character:
    data: dict  # character.json
    files: dict[str, bytes]  # path in the zip -> bytes
    consent: dict | None = None
    identity: dict | None = None
    source: str = ""
    _images: dict[str, Image.Image] = field(default_factory=dict, repr=False)

    @property
    def name(self) -> str:
        return self.data["name"]

    @property
    def kind(self) -> str:
        return self.data["kind"]

    @property
    def origin(self) -> str:
        return self.data["origin"]

    @property
    def description(self) -> str:
        return self.data.get("description", "")

    @property
    def locked(self) -> bool:
        """A person made from photos with no consent record: viewable in the app, never usable."""
        return self.kind == "person" and self.origin == "photos" and self.consent is None

    @property
    def sheet_path(self) -> str:
        return self.data["sheet"]["composite"]

    def view_paths(self) -> list[str]:
        views = self.data["sheet"]["views"]
        return [views[v] for v in VIEWS]

    def photo_paths(self) -> list[str]:
        return [p["path"] for p in self.data.get("photos", [])]

    def image(self, path: str) -> Image.Image:
        """An image from the file as RGB. Sheets may be PNG or JPEG whatever their name, as in the app."""
        if path not in self._images:
            if path not in self.files:
                raise CharacterFileError(f"{self.name} is missing {path}.")
            self._images[path] = Image.open(io.BytesIO(self.files[path])).convert("RGB")
        return self._images[path]

    def reference_paths(self) -> list[tuple[str, str]]:
        """What the app sends for this cast member (lib/studio/cast.ts): the sheet, then for a person
        their first photo, or the front view when they were designed from text."""
        refs = [("sheet", self.sheet_path)]
        if self.kind == "person":
            photos = self.photo_paths()
            refs.append(("photo", photos[0]) if photos else ("front", self.data["sheet"]["views"]["front"]))
        return refs


def _check_character_json(data: object) -> dict:
    if not isinstance(data, dict):
        raise CharacterFileError("character.json isn't an object.")
    if data.get("format") != "portraius.character":
        raise CharacterFileError("This isn't a Portraius character file.")
    if data.get("version") != 1:
        raise CharacterFileError(f"This character file is version {data.get('version')}; this pack reads version 1.")
    if data.get("kind") not in ("person", "element"):
        raise CharacterFileError("character.json has an unknown kind.")
    if data.get("origin") not in ("photos", "designed"):
        raise CharacterFileError("character.json has an unknown origin.")
    name = data.get("name")
    if not isinstance(name, str) or not name.strip() or len(name) > 80:
        raise CharacterFileError("character.json needs a name of 1 to 80 characters.")
    if not isinstance(data.get("description", ""), str):
        raise CharacterFileError("character.json's description isn't text.")
    sheet = data.get("sheet")
    if not isinstance(sheet, dict) or not isinstance(sheet.get("composite"), str) or not isinstance(sheet.get("views"), dict):
        raise CharacterFileError("character.json has no sheet.")
    if any(not isinstance(sheet["views"].get(v), str) for v in VIEWS):
        raise CharacterFileError("character.json is missing a sheet view.")
    photos = data.get("photos", [])
    if not isinstance(photos, list) or len(photos) > 10 or any(not isinstance(p, dict) or not isinstance(p.get("path"), str) for p in photos):
        raise CharacterFileError("character.json's photos aren't valid.")
    return data


def _check_consent(data: object) -> dict:
    ok = (
        isinstance(data, dict)
        and isinstance(data.get("subjectName"), str)
        and data["subjectName"].strip()
        and data.get("method") == "self-check"
        and isinstance(data.get("statement"), str)
        and data["statement"]
        and _date(data.get("acceptedAt"))
        and isinstance(data.get("matchScore"), (int, float))
    )
    if not ok:
        raise CharacterFileError("consent/consent.json isn't a valid consent record.")
    return data  # type: ignore[return-value]


def read_character(path: str) -> Character:
    """Opens a .portraius file and checks it the way the app's importer does."""
    try:
        archive = zipfile.ZipFile(path)
    except zipfile.BadZipFile as err:
        raise CharacterFileError("This isn't a .portraius file (not a zip).") from err
    with archive:
        entries = [i for i in archive.infolist() if not i.is_dir()]
        if len(entries) > MAX_ENTRIES:
            raise CharacterFileError("This file holds more than a character does.")
        if sum(i.file_size for i in entries) > MAX_ZIP_BYTES:
            raise CharacterFileError("This file is over 200 MB.")
        files: dict[str, bytes] = {}
        texts: dict[str, object] = {}
        for info in entries:
            name = info.filename
            if name in JSON_PATHS:
                try:
                    texts[name] = json.loads(archive.read(info).decode("utf-8"))
                except (UnicodeDecodeError, json.JSONDecodeError) as err:
                    raise CharacterFileError(f"{name} isn't valid JSON.") from err
            elif any(p.match(name) for p in PATHS):
                if info.file_size > MAX_FILE_BYTES:
                    raise CharacterFileError(f"{name} is over 50 MB.")
                files[name] = archive.read(info)
            else:
                raise CharacterFileError(f"This file holds something a character doesn't: {name}.")

    if CHARACTER_JSON not in texts:
        raise CharacterFileError("This file has no character.json.")
    data = _check_character_json(texts[CHARACTER_JSON])
    character = Character(
        data=data,
        files=files,
        consent=_check_consent(texts[CONSENT_JSON]) if CONSENT_JSON in texts else None,
        identity=texts.get(FACE_JSON) if isinstance(texts.get(FACE_JSON), dict) else None,
        source=path,
    )
    for needed in [*character.photo_paths(), character.sheet_path, *character.view_paths()]:
        if needed not in files:
            raise CharacterFileError(f"This file is missing {needed}.")
    return character
