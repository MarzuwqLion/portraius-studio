# Demo video script (2:00)

For the #OpenSourceHiggsfield submission. Comfy judges "the work, not your video editing": the demo shows the app
working and explains how it was built, and Most Innovative also needs it to say why it's new. Record the app
itself (Recast, Image, Video, the character page), not slides. Captions double as the voice-over.

| Time | On screen | Voice-over or caption |
| --- | --- | --- |
| 0:00 to 0:08 | A Recast side by side: the dancer, then your character doing the same moves, ending on the end card with its likeness score held on screen | "Every AI studio says it keeps your face. This one shows you the number. Portraius Studio, open source on Comfy." |
| 0:08 to 0:25 | Cast: photos in, the webcam consent check (three prompts, head turn), the turnaround sheet with a score on every view, Export file | "A character is a file you own: photos, sheet, face data and a consent record. No one can make yours from your photos without the webcam check." |
| 0:25 to 0:40 | Image: one preset, three takes, the likeness badge on each; then a take with no face marked Drifted and its automatic retry | "Every output is scored 0 to 100 against that person's own references, in the browser. Under 60, it retries on its own." |
| 0:40 to 0:55 | Video: Image, then animate with the character on MiniMax H3, the score per frame and the lowest frame | "Wherever a person is on screen, MiniMax H3 is the core video model: stills, takes, Recast and speaking lines." |
| 0:55 to 1:10 | Recast with your character picked from the vault and its score on the result, then Director: Draft shots with AI, a shot that continues from the last frame, Export scene | "Recast and Director run on the same character file: put yourself into any clip you own, or shoot a scene shot by shot, and every take is scored." |
| 1:10 to 1:30 | Settings: Use my ComfyUI, the 4090 detected, Never spend credits; the same Image run priced "Free · your GPU"; the likeness report table | "The same site runs on your own GPU with open-weight models, free, from GitHub Pages with nothing to install. And we measured which models keep a face best." |
| 1:30 to 1:45 | ComfyUI with the node pack: Load Portraius Character, Character Prompt, Identity Score on a workflow from `workflows/` | "The character file opens in ComfyUI too, with a node that scores identity on the app's scale." |
| 1:45 to 2:00 | The likeness sheet on a phone, Share; then the repo URL and #OpenSourceHiggsfield | "Portable characters, consent, a likeness score on everything, your GPU or Comfy's. MIT licensed. Link below." |

## Why it's innovative (say it in the video)

- **It measures likeness.** Every output carries a 0 to 100 identity score against the character's own references,
  with an automatic retry under 60. Other studios claim consistency; this one shows a number.
- **Consent is built into the file format.** A character from photos can't exist without a webcam check of that
  person, and the record travels inside the `.portraius` file.
- **One character file, two worlds.** The same file runs the web app and loads in ComfyUI through the node pack.
- **A hosted site that runs on your GPU.** GitHub Pages talks straight to your own ComfyUI: no install, nothing
  leaves your computer, and Comfy's models are there when you want them.

## Positioning (October 27)

Read the other public entries and Comfy's own Openjutsu (MIT, released October 26) before recording. The video
leads with what only this entry has and spends little time on what the field already shows:

- **Lead with:** the likeness number, the consent check on camera, one character file in the web app and in
  ComfyUI, and the hosted site running on your own GPU. No other entry measures likeness or checks consent,
  and the others reach a local GPU only when you install and run the app yourself.
- **Don't lead with:** character swap as such (Comfy's Openjutsu does it on MiniMax H3, and the judges built it),
  the number of models (other entries list 19 to 134), or prices before a run (another entry shows them too).
  Recast is the opening shot because of the score on its end card, not because it swaps a person.
- **Don't open with "Higgsfield promised to open source".** Comfy's blog post and at least one other entry's
  README already open that way.
- **MiniMax H3 bonus:** the official Q&A allows a main prize and a model bonus together, and H3 renders every
  video with a person in it, so the 0:40 line names it as the core video model.

## Checklist before recording

- Your own character from photos (the sample character), with the consent check on camera.
- A Recast with a high score for the opening, and its 9:16 export with the likeness on the end card.
- ComfyUI started with [`launchers/run_portraius_live.bat`](../launchers/run_portraius_live.bat) (in the portable
  folder) if you record against the live site.
- Keep it under 2:00; the submission form rejects longer videos.
