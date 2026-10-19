# M2 notes: character vault

Built on October 19: photo intake with face-api checks, the webcam consent check, sheet generation
(composite plus four views), single-view redraw with grease-pencil picks, describe and save,
`.portraius` export and import, locked imports, and design from text.

## Checked in Chrome on localhost (October 19)

Design from text, end to end, with a designed character ("Walt Harmon"):

| Step | Result |
| --- | --- |
| Four candidate faces (1K, Fast) | All four landed in about 80 s; Router ran them one at a time. |
| Composite (2K, Best) | About 45 s. Front, three-quarter, profile, full body and four expressions, as the template asks. |
| Four views (2K, Best) | About 90 s for all four, started automatically when the composite landed. |
| Identity scores against the picked face | Composite 100, front 100, three-quarter 95, profile 71 (Check), full body 100: 4 of 5 at 80 or more. |
| Single-view redraw | The profile redraw scored 66; picking between takes moved the grease circle and struck the other take. |
| Reload mid-wizard | Resumed on the sheet step with every take and score. |
| Export, import, export | Every file identical, `character.json` included. The file is 33 MB, almost all of it the five 2K PNGs. |
| Locked import | A photo-based copy with no consent record imported as Locked; redraw refused it; the detail page explains why. |
| Delete | The inline confirm removed the character and its files. |

Photo intake, run on prepared copies of Walt's views:

| Input | Result |
| --- | --- |
| Front, three-quarter, full-body views | Good (resized to a 2048 px long edge) |
| Composite | More than one face |
| Plain grey image | No face found |
| Face 110 px tall | Too small (167 px passes; the rule is under 160) |
| Sharpness of the face crop | Sharp 2312; 2 px blur 284; 4 px 42; 6 px 14; 8 px 6. Under 20 counts as heavy blur. Very heavy blur can lose the face entirely, which still rejects the photo, as "No face found". |

## Not yet checked

- **Photo-based creation with a real face and the webcam consent check.** Per the spec, Marzuwq tests
  this with his own face. The Consent row of the acceptance table (a different person fails; all three
  prompts verified) passes only after that test.
- **Unknowns row 12 (webcam yaw in ordinary light).** The thresholds (yaw change 0.18, pitch change
  0.05, smile 0.7, two blinks under 75% of baseline eye openness) are tuned on synthetic landmarks only.
  If turns fail in real light, apply the row's fallback: drop the turn prompts and use blink twice,
  smile, look up, open mouth.
- **"5 photos produce a sheet and 4 views in under 3 minutes."** The designed run took about 2 min
  15 s for the sheet and views. With one queued job at a time per account (M1 findings), this is close
  to the limit; a judge's key may differ.
