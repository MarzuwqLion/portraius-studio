# Recast engines (M4)

## Seedance can't Recast people

The spec puts Motion Transfer and style swap on Seedance 2.5. On October 19 a Seedance draft with a
person in its `reference_video` (an H3 clip of Walt, hosted on the Worker) was refused in 7 s with
`content_policy_violation`, the same refusal as for person images (M3 notes). Recast is about people,
so it runs on the engines that accept them, following Marzuwq's "H3 for people" decision.

## Motion Transfer: H3 and Kling

Test: Walt's 5.2 s H3 clip on a pier at dusk as the performer clip; a different designed person (a
woman in her twenties with a shaved head) as the reference image; prompt "performs exactly the
movement, timing and camera of the reference video, in the same setting".

| Engine | Request | Time | Result |
| --- | --- | --- | --- |
| H3 768P | `reference_image` (data URI) + `reference_video` (Worker URL), `duration: 5`, `ratio: "16:9"` | about 9 min | Same pier, push-in and timing; her face, hair and earrings kept; Walt's coat became a black T-shirt |
| Kling V3 Omni std | `image_list` (base64) + `video_list` with `refer_type: "feature"`, `duration: "5"`, `aspect_ratio: "16:9"` | about 12 min | Same pier, push-in and timing; her face kept; kept Walt's peacoat |

Kling first answered `invalid_input` (empty detail) without `aspect_ratio`; with it, it ran. Both
engines are good at taking over the performer. H3 is the default (faster, and Marzuwq's choice for
people); the Kling result is the closer match when wardrobe should carry over.

### Setting changes don't take on H3

"Same move, new city" through the Recast screen (Walt's diner clip, Walt as the performer, the prompt
asking for "a busy city street at night with neon signs") came back as the diner, frame for frame
(identity 80, worst frame 73). H3 reproduces the reference video's scene; it changes the performer
when the reference image is someone else, but ignores a new setting in the prompt. The setting-change
presets (Same move new city, Neon performance, Concert stage) need another engine or a two-step
(swap the background with Object Swap afterwards). Decided below: a two-step.

## Object Swap A/B (Unknowns row 11)

One 5.2 s clip (Walt in the diner, prepared at 30 fps, 768 by 960) and three swaps, each with a
Nano Banana reference image: his navy coat for a tan trench coat (outfit), his paperback for a red
leather notebook (product), the diner for an old library (background). Twelve edits, run on October
19. BFL takes no reference image, so its prompt described the replacement instead.

| Engine | Outfit | Product | Background | Timing | Time per edit |
| --- | --- | --- | --- | --- | --- |
| Kling V3 Omni (`refer_type: "base"`) | Trench coat | Red notebook | The reference library, exactly | Drifts: after about a second the motion no longer matches the source (still reading while the source looks up); 5.0 s out | about 4 min |
| Wan 2.7 video edit | Trench coat | Red notebook | Library like the reference; also restyled the booth | Matches the source | about 7 min |
| HappyHorse 1.0 video edit | Trench coat | Red notebook | The reference library, booth kept | Matches the source frame for frame | about 3 min |
| BFL video edit (text only) | Trench coat | Paperback turned reddish-brown | A generic library | Matches the source | about 3 min |

**Row 11 fails for Kling:** the swaps look right, but retiming the clip breaks Object Swap's promise
to keep everything else unchanged. **The default is HappyHorse 1.0**: it follows the reference image,
keeps the timing exactly and is the fastest. Its first outputs carried a "Happy Horse" watermark in the
corner; sending `parameters.watermark: false` removes it (checked on a rerun of the product swap).
Wan 2.7 is the runner-up. The four swap presets now target HappyHorse.

## Setting changes: H3, then a HappyHorse location edit

The setting-change presets now carry a `setting` and run two jobs: H3 swaps in the performer and
keeps the clip's scene, then HappyHorse 1.0 (text only, no reference image) moves the result to the
new setting. The Recast screen shows the pair as one card. Tested on the diner result above:

| Prompt | Result |
| --- | --- |
| "Replace the background with a busy city street at night..." | Only the view through the diner window changed; the booth stayed. Identity 85, worst frame 76 |
| "Move the person to a new location: ... Replace everything around them, including walls, windows, furniture and props..." | Walt on a neon street at night, wet pavement, same motion and timing. Identity 84, worst frame 77. About 3 min |

The second prompt is the one the app sends (`settingPrompt` in `lib/studio/recast.ts`).

## Defaults now

| Mode | Engine |
| --- | --- |
| Motion Transfer | MiniMax H3 (performer swap; keeps the clip's setting) |
| Motion Transfer to a new setting | MiniMax H3, then a HappyHorse 1.0 location edit |
| Object Swap | HappyHorse 1.0 video edit, `watermark: false` |
| Style swap | MiniMax H3 |

## Acceptance (Recast row)

Run on October 19 through `startRecast`, with clips prepared the way the Recast screen prepares them.
Test clips are designed people made with H3 text to video; the performer is Walt Harmon.

**Motion Transfer on an 8 s clip: passes.**

| Clip | Preset, resolution | Timing side by side | Median (worst frame) |
| --- | --- | --- | --- |
| Street singer, waist up, locked-off | Swap me in, 768P | Same framing and beats: singing to camera, a head turn at 4.5 to 6 s (his goes the other way), a smile at the end | **82** (72) |
| Rooftop dancer, full body, locked-off | Swap me in, 768P | Same side steps, spin, raised arms and point, beat for beat | 59 (36) |
| Rooftop dancer | Swap me in, 2K | Follows the beats, a little looser than the 768P take | 75 (52) |
| Rooftop dancer | Concert stage step 1 (before "camera" was in its prompt), 768P | Pushed in to a close-up and walked toward the lens: ignores the source camera | 89.5 (82) |

Full-body clips put the face at 40 to 60 px at 768P, where face-api's descriptors are noisy; 2K
doubles that and the median clears 70. The score is the bar the spec sets, so waist-up clips are the
honest demo for Motion Transfer at 768P, and full-body ones want 2K.

**The Tour's sample, replaced on October 26.** The Tour shipped the 89.5 take above: the one that
walks up to the lens. Next to the dancer it read as a different clip, so it was made again with
`npm run recast-sample` (Swap me in, Walt):

| Take | Result | Median (worst frame) |
| --- | --- | --- |
| 768P, seed 1758248209, request 4f7525db-a786-47e8-83b4-957d110b9095 | Same side steps, spin, raised arms and point, and the same locked-off camera, beat for beat | 57 (42) |
| 2K, seed 1419183322, request cf381629-ad59-4511-8f3e-6e03689d6cd8 | Dances for about 4 s, then the camera pushes in and he steps up to the lens | 87.5 (71) |

The 768P take ships, chosen by Marzuwq: it does what Motion Transfer promises, and its score is the
honest one for a full-body dance at that distance. A high score here mostly measured how close the
camera got. The 9:16 export, README GIF, link preview and the Swap me in and Dance double loops were
made again from it.

Frames where the face can't be seen (a spin, a turned head) used to score 0 and set the worst frame
to 0; they're now skipped (`videoScores` in `lib/identity/score-output.ts`).

**Object Swap changes only the target on 3 test clips: passes.** Besides the diner A/B above:

| Clip | Preset | Result |
| --- | --- | --- |
| Sneaker walk, 6.5 s, tracking shot | Sneaker swap (red canvas high-tops) | Only the shoes changed: same legs, jeans, puddle step and reflections, frame for frame |
| Rooftop dancer, 8 s | Outfit change (light-wash denim jacket) | Only the raincoat changed: same dancer, face, trousers, roof and timing |

**Two-step setting change through the app:** Concert stage finished step 1 and the app started the
HappyHorse location edit by itself (`afterRecast`); identity 73.5 (worst 62) after the edit.
