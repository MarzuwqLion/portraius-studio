# Demo video script (2:00)

For the #OpenSourceHiggsfield submission. Comfy judges "the work, not your video editing": the demo shows the app
working and explains how it was built, and Most Innovative also needs it to say why it's new. Record the app
itself (Recast, Image, Video, the character page), not slides. Captions double as the voice-over.

| Time | On screen | Voice-over or caption |
| --- | --- | --- |
| 0:00 to 0:08 | A Recast side by side: the dancer, then your character doing the same moves, ending on the end card with its likeness score held on screen | "Every AI studio says it keeps your face. This one shows you the number. Portraius Studio, open source on Comfy." |
| 0:08 to 0:22 | Cast: photos in, the webcam consent check (the face match, then one prompt passed), the turnaround sheet with a score on every view, Export file | "A character is a file you own: photos, sheet, face data and a consent record. Making one from someone's photos takes a webcam check of that person." |
| 0:22 to 0:34 | Image: one preset, three takes, the likeness badge on each; then a take with no face marked Drifted and its automatic retry | "Every output is scored 0 to 100 against that person's own references, in the browser. Under 60, it retries on its own." |
| 0:34 to 0:44 | Video: Image, then animate with the character on MiniMax H3, the score per frame and the lowest frame | "Wherever a real person is on screen, MiniMax H3 is the core video model: stills, takes, Recast and speaking lines." |
| 0:44 to 1:06 | Blass Effect. Cast and elements, Your own reference: the Princess sheet saved as it is, Real-looking or Animated, the rights checkbox. Then Video, Use references: the cast, the blockout clip, the labels line (image_1 Princess · … · video_1 your clip), Send my prompt exactly as written, Generate. End on the blockout and the Seedance render side by side | "Bring your own world. These are sheets from my game, Blass Effect, saved as characters exactly as drawn. Give it a rough gameplay blockout and Seedance 2.5 keeps the camera and timing while the cast, sets and voices become a finished scene. Write the prompt the way you would in ComfyUI." |
| 1:06 to 1:16 | Recast with your character picked from the vault and its score on the result, then Director: a shot that continues from the last frame, Export scene | "Recast and Director run on the same character file: put yourself into any clip you own, or shoot a scene shot by shot, every take scored." |
| 1:16 to 1:32 | Settings: Use my ComfyUI, the 4090 detected, Never spend credits; the same Image run priced "Free · your GPU"; the likeness report table | "The same site runs on your own GPU with open-weight models, free, from GitHub Pages with nothing to install. And we measured which models keep a face best." |
| 1:32 to 1:46 | `workflows/` and `workflows/local/` in the repo, one graph opened in ComfyUI; then the node pack: Load Portraius Character, Character Prompt, Identity Score | "Every graph the app runs ships as a ComfyUI workflow. The character file opens there too, with a node that scores identity on the app's scale." |
| 1:46 to 2:00 | The likeness sheet on a phone, Share; then the repo URL and #OpenSourceHiggsfield | "Portable characters, consent, a likeness score on everything, your own worlds, your GPU or Comfy's. MIT licensed. Link below." |

## Why it's innovative (say it in the video)

- **It measures likeness.** Every output carries a 0 to 100 identity score against the character's own references,
  with an automatic retry under 60. Other studios claim consistency; this one shows a number.
- **Consent is built into the file format.** A character from photos can't exist without a webcam check of that
  person, and the record travels inside the `.portraius` file.
- **Blockout to final, with your own cast.** Your own character sheets and locations become characters as they
  are, and a rough 3D blockout drives the camera and timing of the finished scene. Seedance's references go
  through its library the way ComfyUI's node sends them, and the exact-prompt switch takes a ComfyUI-style prompt
  with `image_1` to `video_1` labelled on screen.
- **One character file, two worlds.** The same file runs the web app and loads in ComfyUI through the node pack,
  and every graph the app runs is in `workflows/` for ComfyUI.
- **A hosted site that runs on your GPU.** GitHub Pages talks straight to your own ComfyUI: no install, nothing
  leaves your computer, and Comfy's models are there when you want them.

## Positioning (October 29)

Re-read the field on October 29, the day before the deadline. New entries since October 27 (Cheapsfield,
PlateLock, Seam) go for Open Weights Only and the LTX bonus. The video leads with what only this entry has and
spends little time on what the field already shows:

- **Lead with:** the likeness number, the consent check on camera, the Blass Effect blockout beside its render,
  one character file in the web app and in ComfyUI, and the hosted site running on your own GPU. No other entry
  measures likeness or checks consent, and the others reach a local GPU only when you install and run the app
  yourself.
- **Don't lead with:** character swap as such (Comfy's Openjutsu does it on MiniMax H3, and the judges built it),
  "a video as a reference" as such (haggs rebuilds an edit from a reference video, and toybox-director blocks shots
  with toys on a 3D stage), the number of models (other entries list 19 to 134), or prices before a run (another
  entry shows them too). Recast is the opening shot because of the score on its end card, and the blockout segment
  is about your own game's cast and world, not the clip.
- **Don't open with "Higgsfield promised to open source".** Comfy's blog post and at least one other entry's
  README already open that way.
- **Categories:** each entry gets one main category plus one model bonus, and every entry is considered for Best
  Overall. Enter Most Innovative with the MiniMax H3 bonus: H3 renders every video with a real person in it and
  every Recast, so the 0:34 line names it as the core video model. The Blass Effect scene is on Seedance because
  its cast comes from your own references, and the 0:44 line says so.

## Checklist before recording

- Your own character from photos (the sample character), with the consent check on camera.
- A Recast with a high score for the opening, and its 9:16 export with the likeness on the end card.
- The Blass Effect sheets saved as characters, the blockout recorded without the game's HUD (Seedance copies
  interface it sees in the clip), and the finished render ready to play beside it, so the segment doesn't wait
  on a generation.
- ComfyUI started with [`launchers/run_portraius_live.bat`](../launchers/run_portraius_live.bat) (in the portable
  folder) if you record against the live site.
- Keep it under 2:00; the submission form rejects longer videos.
