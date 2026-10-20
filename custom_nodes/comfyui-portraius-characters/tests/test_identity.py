"""Identity Score's scale and, when the FaceNet weights are around, a real score on the sample character."""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

torch = pytest.importorskip("torch")

from portraius.identity import band, score_from_distance  # noqa: E402

SAMPLES = os.path.join(os.path.dirname(__file__), "..", "..", "..", "public", "samples")
WEIGHTS = os.environ.get("PORTRAIUS_FACENET_WEIGHTS", "")


def test_maps_distance_onto_the_apps_scale_and_bands():
    # Calibrated on the M5 designed people: 80 sits at the top of the same-person range, 60 in the gap.
    assert score_from_distance(0.3) == 100
    assert score_from_distance(0.77) == 80
    assert score_from_distance(0.94) == 60
    assert score_from_distance(1.19) < 60
    assert score_from_distance(2.0) == 0
    assert [band(s) for s in (95, 80, 79, 60, 59)] == ["Strong match", "Strong match", "Check", "Check", "Drift"]


@pytest.mark.skipif(not os.path.exists(WEIGHTS), reason="set PORTRAIUS_FACENET_WEIGHTS to the VGGFace2 weights file")
def test_scores_the_sample_character_against_his_own_stills():
    from PIL import Image

    from portraius.character import read_character
    from portraius.identity import FaceScorer

    walt = read_character(os.path.join(SAMPLES, "walt-harmon.portraius"))
    scorer = FaceScorer(WEIGHTS)
    score, report = scorer.score_images([Image.open(os.path.join(SAMPLES, "walt-diner.jpg"))], walt)
    assert score >= 80, report
    frames, report = scorer.score_images([Image.open(os.path.join(SAMPLES, f)) for f in ("walt-letter.jpg", "satchel-sheet.jpg")], walt)
    assert "scored 1 of 2 frames" in report and frames >= 80
