# M3 notes: Image and Video studios

Built on October 19: both screens, the prompt compiler with camera and look presets, the film-strip
jobs tray (Cancel, Retry, reload recovery), the estimate on Generate, Seedance draft then final,
Continue, Retry silent, MiniMax H3 as "H3 (2K)", identity scoring of outputs, and the automatic drift
retry.

## Seedance 2.5 refuses photoreal people as input images

The biggest finding of M3. Tested on October 19 with the designed character Walt Harmon:

| Model | Input | Result |
| --- | --- | --- |
| Seedance 2.5 | A diner still of Walt as `first_frame` (queued, request `e8a2639b-751b-4279-ac25-f2bb0c66a462`) | `content_policy_violation` |
| Seedance 2.5 | The same still, synchronous | 400, `refusal_subject: input_image`, in 10 s |
| Seedance 2.5 | Walt's plain studio front view as `first_frame` | 400, `input_image` |
| Seedance 2.5 | Walt's front view as `reference_image` | 400, `input_image` |
| Seedance 2.5 | The diner still cropped to the rainy window, no person | Rendered (137 s) |
| MiniMax H3 768P | The diner still as `first_frame` | Rendered |
| Kling V3 Omni std | The diner still as `first_frame` (request `a6371d7b-21bc-44f3-be34-d7623f35c4d6`) | Rendered in 54 s; served from `v15-kling-fdl.klingai.com` |

So Seedance, the spec's default and core video model, won't take any image of a realistic person,
whatever the role. Router doesn't name the reason on queued requests; the schema lists BytePlus codes
such as `InputImageSensitiveContentDetected.PrivacyInformation` and `.DeepFake`, which fit. Still first,
From references and Continue all depend on such images, so every video with a cast is affected. Text
to video and person-free first frames still work on Seedance.

**Open (a Decisions-level change, asked of Marzuwq):** which model renders video with a cast.

## Identity scores before calibration

Ten 2K Best images of Walt in a diner (one reference face, his picked candidate) scored 73, 75, 73, 54,
75, 83, 82, 76, 75 and 75: 2 of 10 at 80 or more. The 54 triggered the automatic retry, which scored 71
and was shown first. The images are plainly Walt; the raw distances are the issue:

- Walt's images against his reference: 0.42 to 0.53 (median 0.45). Adding his sheet views as
  references only moved the best distance to about 0.44.
- Three different men drawn from the same description (the other candidate faces): 0.32 to 0.40 from
  Walt's reference, closer than Walt's own scene images.

The Image studio row ("8 of 10 score 80 or more") can't pass on the current constants (0.35 maps to
100, 0.75 to 0), and the hard negatives above overlap the positives. That's Unknowns row 13, checked in
M5 on 20 same-person and 20 different-person pairs; its fallback is the `vertexai/gemini-3.8-flash`
judge. Same-description look-alikes are harder than a fair different-person set, so M5 should run the
proper test before switching.

## Smaller findings

- **Queue concurrency varies.** M1 saw two images run one after the other; here ten images queued while
  five ran at once. Job cards show the queue position either way.
- **Row 9 resolved:** a final sent with `return_last_frame: true` returns `last_frame_url`. A final without
  one still gets its last frame grabbed in the browser.
- **H3** at 768P with a first frame downloads in the browser with no proxy needed.
