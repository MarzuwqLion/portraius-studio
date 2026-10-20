"""Reading .portraius files the way the app's importer does, on the app's sample character."""

import json
import os
import sys
import zipfile

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from portraius.character import CharacterFileError, read_character  # noqa: E402

WALT = os.path.join(os.path.dirname(__file__), "..", "..", "..", "public", "samples", "walt-harmon.portraius")
pytestmark = pytest.mark.skipif(not os.path.exists(WALT), reason="needs the app repo's sample character")


def rewrite(tmp_path, change=None, add=None, name="changed.portraius"):
    """A copy of Walt's file with character.json changed and files added."""
    out = tmp_path / name
    with zipfile.ZipFile(WALT) as src, zipfile.ZipFile(out, "w") as dst:
        for info in src.infolist():
            data = src.read(info)
            if info.filename == "character.json" and change:
                doc = json.loads(data)
                change(doc)
                data = json.dumps(doc).encode()
            dst.writestr(info, data)
        for path, data in (add or {}).items():
            dst.writestr(path, data)
    return str(out)


def test_reads_the_sample_character():
    walt = read_character(WALT)
    assert walt.name == "Walt Harmon"
    assert (walt.kind, walt.origin, walt.locked) == ("person", "designed", False)
    assert [kind for kind, _ in walt.reference_paths()] == ["sheet", "front"]
    sheet = walt.image(walt.sheet_path)
    assert sheet.mode == "RGB" and sheet.width > sheet.height
    assert len(walt.view_paths()) == 4


def test_locks_a_person_from_photos_without_consent(tmp_path):
    path = rewrite(tmp_path, change=lambda d: d.update(origin="photos"))
    assert read_character(path).locked is True


def test_refuses_what_the_app_refuses(tmp_path):
    with pytest.raises(CharacterFileError, match="not a zip"):
        bad = tmp_path / "not.portraius"
        bad.write_bytes(b"hello")
        read_character(str(bad))
    with pytest.raises(CharacterFileError, match="version 2"):
        read_character(rewrite(tmp_path, change=lambda d: d.update(version=2)))
    with pytest.raises(CharacterFileError, match="something a character doesn't"):
        read_character(rewrite(tmp_path, add={"payload.exe": b"MZ"}))
    with pytest.raises(CharacterFileError, match="valid consent record"):
        read_character(rewrite(tmp_path, add={"consent/consent.json": b'{"method": "trust me"}'}))
