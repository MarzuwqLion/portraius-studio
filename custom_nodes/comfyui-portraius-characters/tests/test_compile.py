"""The Python compiler must give the app's prompts word for word (cases from npm run nodepack)."""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from portraius.compile import CastMember, camera_phrases, compile_image_prompt, slots_in  # noqa: E402

with open(os.path.join(os.path.dirname(__file__), "compile_cases.json"), encoding="utf-8") as f:
    CASES = json.load(f)["cases"]


def test_matches_the_app_on_every_recorded_case():
    assert len(CASES) >= 6
    for case in CASES:
        given = case["input"]
        cast = [
            CastMember(slot=m["slot"], name=m["name"], kind=m["kind"], references=m["references"], description=m.get("description", ""))
            for m in given["cast"]
        ]
        got = compile_image_prompt(given["scene"], cast, given["camera"], given["model_id"], given["editing"])
        assert got == case["prompt"], f"\n--- app ---\n{case['prompt']}\n--- port ---\n{got}"


def test_uses_per_model_wording():
    assert camera_phrases({"movement": "slow-push-in"}, "kling/kling-v3-omni") == ["slow dolly-in, steady"]
    assert camera_phrases({"movement": "slow-push-in"}, "vertexai/gemini-nano-banana-2.1") == ["the camera slowly pushes in toward the subject"]


def test_lists_slots_in_order_of_first_use():
    assert slots_in("{Lead} meets {second}, then {lead} leaves") == ["lead", "second"]
