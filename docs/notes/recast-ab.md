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
(swap the background with Object Swap afterwards). To decide after the A/B below.

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

## Defaults now

| Mode | Engine |
| --- | --- |
| Motion Transfer | MiniMax H3 (performer swap; keeps the clip's setting) |
| Object Swap | HappyHorse 1.0 video edit, `watermark: false` |
| Style swap | MiniMax H3 |
