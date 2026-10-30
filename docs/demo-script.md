# Demo video script (1:55)

For the #OpenSourceHiggsfield submission. Comfy judges "the work, not your video editing": the demo shows the app
working and explains how it was built, and Most Innovative also needs it to say why it's new.

The cut is `demo-assets/out/portraius-demo-v2.mp4` (1:55, 1080p). It's silent except the Blass Effect render,
which keeps its dialogue. The voice-over below is timed to it: about 150 words a minute, each line starting with
its segment. A line that runs half a second long is fine; one that runs into the next block isn't.

## Voice-over

| Time | On screen | Voice-over | Words |
| --- | --- | --- | --- |
| 0:00 to 0:11 | Recast: the dancer, then Walt doing the same moves; Walt's coffee Recast with Likeness 100 | "This is Recast: a clip you own, performed by your character. And every take comes back with a number. Likeness: one hundred, scored against the character's own photos." | 27 |
| 0:11 to 0:14 | Title card | "Portraius Studio. Open source, built on Comfy." | 7 |
| 0:14 to 0:32 | Cast: photos, the webcam consent check, all passed, face match 100 | "A character starts as three to ten photos, checked in your browser. Then a live webcam check: turn left, smile, turn right, and your face has to match the photos. No match, no character. The consent record travels inside the file." | 42 |
| 0:32 to 0:47 | The turnaround sheet, every view scored, Export file, the likeness sheet and Share | "From those photos it draws a turnaround sheet and scores every view against you. Export it as a file you own. The likeness sheet puts your best shots and their scores in one picture, ready to post." | 37 |
| 0:47 to 0:55 | Image: generating, the scored takes, one Drifted and its retry | "Put your character in any shot. Every image is scored zero to a hundred, and anything under sixty retries on its own." | 21 |
| 0:55 to 1:06 | Video on H3, the take card with the lowest frame | "Then animate it on MiniMax H3, the core model wherever a real person is on screen. Every frame is scored, and the weakest one is flagged." | 25 |
| 1:06 to 1:17 | Bring your own world; Use references; the blockout | "Now bring your own world. These are sheets from my game, Blass Effect. Give Seedance the cast, a rough gameplay blockout and a ComfyUI-style prompt…" | 25 |
| 1:17 to 1:20 | The Seedance render begins, the blockout inset | "…same camera, same timing. A finished scene." Then stop and let the scene's dialogue play. | 7 |
| 1:33 to 1:41 | Director: the shot list with scored takes, then the exported scene | "Director plans a whole scene, shot by shot, from the same character file. Every take scored, exported as one scene." | 20 |
| 1:41 to 1:50 | Settings: Never spend credits; `workflows/` and `workflows/local/` | "Run open-weight models free on your own GPU, from the hosted site. Every graph ships as a ComfyUI workflow." | 19 |
| 1:50 to 1:55 | End card | "Portraius Studio. Consent built in, likeness you can measure. MIT licensed, link below." | 13 |

Mixing: from 1:17 to 1:33 the Blass render plays its own dialogue. Keep it at full level. If a voice-over line
overlaps it, lower the scene audio by about 10 dB under the voice.

## What the video has to land (Most Innovative + MiniMax H3)

Each point is said aloud and shown on screen in the cut:

- **It measures likeness.** Likeness 100 at 0:06, the scored views, the image scores with an automatic retry under
  60, the per-frame score on H3, scored takes in Director. Other studios claim consistency; this one shows a number.
- **Consent is part of the file format.** A character from photos can't exist without a webcam check of that
  person, and the record travels inside the `.portraius` file (0:14 to 0:32). No other entry checks consent.
- **Blockout to final, with your own cast.** Your own sheets become characters as they're drawn, and a rough 3D
  blockout drives the camera and timing of the finished scene (1:06 to 1:33). The point is your own game's cast and
  world, not "a video as a reference": haggs and toybox-director already show that part.
- **MiniMax H3 is the core video model.** It renders every video with a real person in it and every Recast, and the
  0:55 line says so. That carries the H3 bonus.
- **Open and portable.** The hosted site runs on your own GPU, and every graph is a ComfyUI workflow in
  `workflows/` (1:41 to 1:50).

## Submission

- **Categories:** Most Innovative, with the MiniMax H3 bonus. Every entry is also considered for Best Overall.
- **Repo:** add the `open-source-higgsfield` topic and the website link before submitting.
- **Description for the form:**
  > Portraius Studio is an open-source AI film studio on Comfy that shows you the number: every image, video and
  > Recast is scored 0 to 100 for likeness against the character's own photos, and anything under 60 retries on
  > its own. Characters are portable files with a webcam consent check built in. Bring your own world: your own
  > character sheets and a rough 3D blockout become a finished scene. Runs on Comfy's models or free on your own
  > GPU, and every graph ships as a ComfyUI workflow. MIT licensed.
- Keep the video under 2:00; the form rejects longer videos.

## Positioning (October 29)

Re-read the field on October 29, the day before the deadline. New entries since October 27 (Cheapsfield,
PlateLock, Seam) go for Open Weights Only and the LTX bonus. The video leads with what only this entry has and
spends little time on what the field already shows:

- **Lead with:** the likeness number, the consent check on camera, the Blass Effect blockout beside its render, and
  the hosted site running on your own GPU. No other entry measures likeness or checks consent.
- **Don't lead with:** character swap as such (Comfy's Openjutsu does it on MiniMax H3, and the judges built it),
  "a video as a reference" as such, the number of models (other entries list 19 to 134), or prices before a run.
- **Don't open with "Higgsfield promised to open source".** Comfy's blog post and at least one other entry's
  README already open that way.
