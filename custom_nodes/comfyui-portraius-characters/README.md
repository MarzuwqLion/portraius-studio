# Portraius Characters for ComfyUI

A character you make in [Portraius Studio](https://github.com/MarzuwqLion/portraius-studio) is one `.portraius` file:
the photos, a turnaround sheet, four views, the face data and, for a real person, their consent record. These nodes
let you use that file in ComfyUI the way the app does.

| Node | Takes | Gives |
| --- | --- | --- |
| **Load Portraius Character** | A `.portraius` file from `ComfyUI/input/characters/` | The character, its sheet, its four views, its photos, name and description |
| **Character Prompt** | 1 to 4 characters, a scene with `{slots}`, camera picks and a look | The prompt the app would send Nano Banana 2.1, the reference images it names, and who each slot is |
| **Identity Score** | An image or a batch of video frames, and a character | A 0 to 100 score on the app's scale, and a report |

## Install

1. Copy this folder into `ComfyUI/custom_nodes/`, or install it from the Comfy Registry once it's published:
   `comfy node install portraius-characters`.
2. Restart ComfyUI. The nodes are under **Portraius**.
3. Put your `.portraius` files in `ComfyUI/input/characters/`. The app's sample character, Walt Harmon, is
   [`public/samples/walt-harmon.portraius`](../../public/samples/walt-harmon.portraius).

Nothing else to install: the nodes use the torch, torchvision, NumPy and Pillow that come with ComfyUI. The first
Identity Score run downloads FaceNet's weights (107 MB) into `ComfyUI/models/facenet/` and checks them against
their SHA-256.

## Example

`example_workflows/portraius-character-still.json` shows up under this pack in ComfyUI's template browser:
Load Portraius Character → Character Prompt → Nano Banana 2.1 → Save Image, with Identity Score on the still.
Nano Banana 2.1 is a partner node, so that step needs a Comfy account with credits.

## How it matches the app

- **Same prompt.** Character Prompt is a Python port of the app's prompt compiler: reference legend ("Image 1 is
  the reference sheet for LEAD (Walt Harmon)"), identity lock, descriptions, scene, camera and look phrases, and the
  skin realism line. The app's tests write its own output for a set of cases into `tests/compile_cases.json`, and
  `tests/test_compile.py` checks the port gives the same text, word for word.
- **Same slots.** People are `{lead}`, `{second}` and `{third}` in the order you connect them; elements are named
  for their type, like `{outfit}` or `{prop}`. A scene naming anyone outside the cast is refused.
- **Same references.** Per person the sheet and their first photo (or, for a designed character, the front view);
  per element its sheet. They come out as one batch, each centred on Studio grey, which the Nano Banana 2.1 node
  sends as separate images.
- **Same consent rule.** A person made from photos without a consent record won't load, as in the app. The record
  is an attestation by the person in the photos, not proof.

## Identity Score

The app scores faces in the browser with face-api. ComfyUI has torch, so this node uses MTCNN to find faces and
FaceNet (InceptionResnetV1 trained on VGGFace2) to compare them. It reports on the app's scale and bands: 80 and up
is a strong match, 60 to 79 check, under 60 drift. Faces under 80 px aren't scored. For a batch of frames it reports
the median and the worst frame, like the app does for video.

The distance-to-score constants were calibrated on the same 20 same-person and 20 different-person pairs of
designed people the app was calibrated on: 19 of 20 same-person pairs score 80 or more, and every different-person
pair scores under 32. The model differs from the app's, so the two scores for one image won't match exactly.

## Licenses

MIT, like the app. `portraius/facenet_pytorch/` is vendored from
[facenet-pytorch](https://github.com/timesler/facenet-pytorch) 2.6.0 (MIT, Timothy Esler; its license is beside the
code), with MTCNN's weights. FaceNet's VGGFace2 weights are downloaded from that project's releases; check the
VGGFace2 dataset's terms for your use.

## Tests

From this folder, with a Python that has torch (ComfyUI's own works):

```
python -m pytest tests
```

Set `PORTRAIUS_FACENET_WEIGHTS` to the weights file to include a real score on the sample character. In the app
repo, `npm run nodepack` regenerates the presets, the compiler cases and the example workflow after a change there.
