"""Identity score in ComfyUI (spec: Identity match score, and the node pack's Identity Score node).

The app scores faces in the browser with face-api. Here MTCNN finds and aligns faces and FaceNet
(InceptionResnetV1 trained on VGGFace2) embeds them: both vendored from facenet-pytorch (MIT), which
pins an old torch, so it isn't a dependency. The scale and bands are the app's (0 to 100; 80 and up a
strong match, 60 to 79 check, under 60 drift), but the model differs, so the numbers won't match the
app's exactly. The two distance constants are calibrated in docs/notes/m7-notes.md.
"""

from __future__ import annotations

import hashlib
import os
import statistics
from dataclasses import dataclass

import numpy as np
import torch
from PIL import Image

from .character import Character

WEIGHTS_URL = "https://github.com/timesler/facenet-pytorch/releases/download/v2.2.9/20180402-114759-vggface2.pt"
WEIGHTS_FILE = "20180402-114759-vggface2.pt"
WEIGHTS_SHA256 = "281cebca8662831adb987a874bdcb36e73f5b1c6dc5ee5878f305e985625d99b"

# Faces smaller than this in an output aren't scored, as in the app.
MIN_FACE_PX = 80
MIN_FACE_CONFIDENCE = 0.9

# Distance between unit-length FaceNet embeddings, mapped to a score: this close or closer is 100,
# this far or further is 0 (calibrated on the M5 designed people, docs/notes/m7-notes.md).
DISTANCE_PERFECT = 0.60
DISTANCE_ZERO = 1.45

MATCH_SCORE = 80
CHECK_SCORE = 60


def score_from_distance(d: float) -> int:
    t = (DISTANCE_ZERO - d) / (DISTANCE_ZERO - DISTANCE_PERFECT)
    return round(100 * min(1.0, max(0.0, t)))


def band(score: float) -> str:
    if score >= MATCH_SCORE:
        return "Strong match"
    if score >= CHECK_SCORE:
        return "Check"
    return "Drift"


def ensure_weights(folder: str) -> str:
    """FaceNet's VGGFace2 weights (107 MB), fetched once into folder and checked against their hash."""
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, WEIGHTS_FILE)
    if not os.path.exists(path):
        torch.hub.download_url_to_file(WEIGHTS_URL, path, progress=True)
    with open(path, "rb") as f:
        digest = hashlib.sha256(f.read()).hexdigest()
    if digest != WEIGHTS_SHA256:
        os.remove(path)
        raise RuntimeError(f"{WEIGHTS_FILE} didn't match its expected hash and was deleted. Run the node again to fetch it again.")
    return path


@dataclass
class Face:
    box: tuple[float, float, float, float]
    embedding: np.ndarray

    @property
    def height(self) -> float:
        return self.box[3] - self.box[1]


class FaceScorer:
    def __init__(self, weights_path: str, device: str | torch.device = "cpu"):
        from .facenet_pytorch.models.inception_resnet_v1 import InceptionResnetV1
        from .facenet_pytorch.models.mtcnn import MTCNN

        self.device = torch.device(device)
        self.mtcnn = MTCNN(image_size=160, margin=14, keep_all=True, min_face_size=40, device=self.device)
        self.net = InceptionResnetV1(pretrained=None).eval().to(self.device)
        state = torch.load(weights_path, map_location=self.device, weights_only=True)
        # The checkpoint keeps its VGGFace2 classifier; only the embedding is used.
        self.net.load_state_dict({k: v for k, v in state.items() if not k.startswith("logits.")})
        self._references: dict[str, list[np.ndarray]] = {}

    def faces(self, image: Image.Image, min_height: float = MIN_FACE_PX) -> list[Face]:
        """Every confident face at least min_height tall, largest first."""
        image = image.convert("RGB")
        boxes, probs = self.mtcnn.detect(image)
        if boxes is None:
            return []
        keep = [i for i, (b, p) in enumerate(zip(boxes, probs)) if p is not None and p >= MIN_FACE_CONFIDENCE and b[3] - b[1] >= min_height]
        if not keep:
            return []
        crops = self.mtcnn.extract(image, boxes[keep], None)
        with torch.no_grad():
            embeddings = self.net(crops.to(self.device)).cpu().numpy()
        found = [Face(tuple(float(v) for v in boxes[i]), embeddings[k]) for k, i in enumerate(keep)]
        return sorted(found, key=lambda f: f.height, reverse=True)

    def references(self, character: Character) -> list[np.ndarray]:
        """The character's own face: every source photo, or for a designed character the front and
        three-quarter views (the app keeps the picked face's descriptor)."""
        key = f"{character.source}:{character.data.get('updatedAt')}"
        if key not in self._references:
            views = character.data["sheet"]["views"]
            paths = character.photo_paths() or [views["front"], views["threeQuarter"]]
            refs = []
            for path in paths:
                found = self.faces(character.image(path), min_height=40)
                if found:
                    refs.append(found[0].embedding)
            if not refs:
                raise ValueError(f"No face was found in {character.name}'s photos or views.")
            self._references[key] = refs
        return self._references[key]

    def score_image(self, image: Image.Image, character: Character) -> tuple[int | None, float | None, int]:
        """The best match among the faces in one image: (score, distance, faces found)."""
        refs = self.references(character)
        faces = self.faces(image)
        if not faces:
            return None, None, 0
        distance = min(float(np.linalg.norm(f.embedding - r)) for f in faces for r in refs)
        return score_from_distance(distance), distance, len(faces)

    def score_images(self, images: list[Image.Image], character: Character) -> tuple[float, str]:
        """One image's score, or for frames the median and worst frame, as the app reports video."""
        rows = [self.score_image(img, character) for img in images]
        scores = [s for s, _, _ in rows if s is not None]
        if not scores:
            return 0.0, f"{character.name}: no face of 80 px or more was found, so there's no score."
        lines = []
        if len(images) == 1:
            score, distance, count = rows[0]
            lines.append(f"{character.name}: {score}, {band(score)} (distance {distance:.3f}, {count} face{'s' if count != 1 else ''} found).")
            result = float(score)
        else:
            result = float(statistics.median(scores))
            worst = min(scores)
            lines.append(f"{character.name}: median {result:g}, {band(result)}; worst frame {worst}; scored {len(scores)} of {len(images)} frames.")
            for i, (score, distance, count) in enumerate(rows):
                lines.append(f"Frame {i + 1}: " + (f"{score} (distance {distance:.3f})" if score is not None else "no face found"))
        lines.append("FaceNet scores follow the app's scale but not its model, so they won't match the app's exactly.")
        return result, "\n".join(lines)
