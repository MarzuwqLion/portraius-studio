# M6 notes: Director

## How it's built

- **Scenes are JSON in the blobs table** (`scene:<id>`), like the wizard draft. The Contracts schema has
  no scenes table, and adding one would mean a Dexie version change.
- **Shot schema:** the spec's `Shot`, with camera fields holding `presets/camera` option IDs (they match
  the spec's enums: `ECU` to `EWS`, `eye` to `dutch`), plus `n` (creation number, the seed offset),
  `rolls` (motion re-rolls), the still job IDs, the picked anchor, the take and the final. A shot's seed
  is scene seed + `n` + 1009 × `rolls`, so moving a shot or re-rolling another keeps it.
- **Continuity:** the location is appended to every shot's action word for word, and the scene's film
  settings (genre, camera body, era, pacing, look) ride on every shot's camera phrases. A shot's cast
  is the scene's cast members its action names (`{lead}`); a shot naming nobody has no cast.
- **Anchors:** Nano Banana 2.1 through the Image studio's `startImages`, so stills get the identity
  score and the automatic drift retry for free.
- **Animate:** the Video studio's `startVideo` in "image" mode with the anchor as the first frame. A
  face in the anchor routes the shot to MiniMax H3 (Marzuwq's "H3 for people" decision), which renders
  once at 768P; a shot without people is a Seedance 480p draft, with "Render final 1080p" from the
  draft's ID.
- **Chaining (`continue`) is P2 and not built.** Every shot is a cut.

## Anchors at "fast"

Six 2K "best" stills (high thinking) sent together: three came back `request_timeout` from the
provider after about 60 s. Anchors now draw at 2K "fast"; a failed still retries at "fast" too.

## Export and Unknowns row 15

`lib/media/stitch.ts` scales and pads every shot to one frame, resamples to 24 fps, gives silent
shots a silent AAC track, and joins them with `concat`, or with 6-frame `xfade`/`acrossfade`
crossfades. Every export carries the MP4 comment "AI-generated with Portraius Studio" (Security,
metadata row).

**Row 15 fails at 1080p:** single-thread ffmpeg.wasm re-encoded a 3-shot, 17 s scene (one Seedance
1080p final and two H3 768P clips, crossfades on) at about 7.5 s of work per second of output: 47% at
67 s, so about 140 s in all, past the 2-minute bar. Fallback applied: shots that already share codec,
size, frame rate and audio are joined by stream copy (`-f concat -c copy`, no re-encode); everything
else is re-encoded at 720p (1280×720, 720×1280 for 9:16, 1680×720 for 21:9).

## Acceptance: a 3-shot scene exports as one MP4 (passes)

"The Letter", made through the Director screen on October 19:

| Shot | Action | Engine | Identity |
| --- | --- | --- | --- |
| 1, wide | Rain on the diner window, an empty booth, coffee going cold | Seedance draft, then the 1080p final | No cast |
| 2, medium | {lead} turns a sealed, yellowed envelope over in his hands | MiniMax H3 768P (face in the anchor) | 76 (worst 72) |
| 3, close-up, slow push-in | {lead} looks up toward the door and almost smiles | MiniMax H3 768P | 95 (worst 93) |

Anchor stills scored 92 to 100. Export with crossfades: one 14.9 s MP4, 1280×720, 1.95 MB, with the
AI-generated comment in the file, saved to the library as a scene. The 720p re-encode took between
60 and 87 s, under the 2-minute bar.

ffmpeg.wasm's own progress share follows the first input, so the button read 100% a third of the way
in; progress now comes from ffmpeg's `time=` status lines over the scene's length.

## Remix links

A recipe comes from a finished job's stored request: the prompt with its `{slots}`, the camera picks,
the settings and the seed, never a character, photo or descriptor. Edits, first-frame videos and
advanced prompt overrides aren't shared: they carry the original person's own picture or the
compiled prompt with character descriptions. The link is `#/remix?r=` plus the canonical JSON,
deflated (`CompressionStream("deflate-raw")`) and base64url-encoded: 420 characters for a diner image.

**Acceptance (round trip, passes in a new tab):** the link decoded into the recipe card (prompt,
85 mm, soft key, medium close-up, 4:5), the slot took Walt Harmon from the vault, and the run (at 1K
fast, to keep test spend low) finished in 32 s with identity 89 and `remixOf: e89b366b7e690531` on
the generation. The same link opened on the GitHub Pages site (another origin: no key, empty vault) showed the
same recipe card and, with no person in that vault, "Design a character" instead of the slot picker.

## Follow-ups

- Director's anchor stills also appear in the Image studio's results (they're image jobs), and a
  manual retry there is labelled "Automatic retry". Cosmetic.

## AI-generated tag on downloads (Security, metadata row)

`lib/media/ai-tag.ts` writes the tag on the bytes, with no re-encode, whenever a file leaves the app
(Download on a take, the library zip): PNG gets an `iTXt` XMP packet after `IHDR`, JPEG an APP1 XMP
segment after the JFIF and Exif headers, MP4 a QuickTime `©cmt` atom in `moov/udta`. The XMP carries the
IPTC digital source type `trainedAlgorithmicMedia`, `xmp:CreatorTool` Portraius Studio and the
description "AI-generated with Portraius Studio". When `moov` comes before `mdat` (Kling, our own trims)
every `stco`/`co64` chunk offset moves by the bytes added.

**Several providers already sign their files.** Checked on the library's own outputs:

| Output | What it carries | What the app does |
| --- | --- | --- |
| Nano Banana 2.1 PNG | C2PA manifest (`caBX`), XMP with `trainedAlgorithmicMedia` and "Made with Google AI" | Leaves it as is |
| Seedance 2.5 MP4 and last-frame JPEG | C2PA (`uuid` box `d8fec3d6…`, APP11 JUMBF) | Leaves it as is |
| BFL video edit MP4 | C2PA `uuid` box | Leaves it as is |
| MiniMax H3 MP4 | TC260 AIGC label in `udta/meta` (`mdta` keys), not C2PA | Adds `©cmt` beside it |
| HappyHorse, Kling, Freepik, canvas frames | Nothing | Adds the tag |

A C2PA hard binding hashes the whole file, so one added byte breaks the provider's signature. A
signed credential that already says AI-generated is worth more than our comment, so those files are
handed out unchanged. ffmpeg.wasm read the comment back from tagged H3, HappyHorse and Kling clips and
a trimmed clip, and decoded each with no errors. Director's scene and the 9:16 export get the comment
from ffmpeg itself.

## Make it real (Finishing, Realism pass)

The Freepik skin enhancer runs on any still: the picked take in the Image studio, or a still in the
library. A Strength slider scales the three settings together (80 gives the spec's 80, 10, 4). The
pass keeps the still's cast, so the runner scores it again, and the result shows Before and After in
one frame with a wipe, plus both scores.

A probe on a 928×1152 still (request `2db0bfb0-5f50-430f-8b0d-54415d0b35bd`): 103 s, and the result
came back at 3840×4800 as a 31.6 MB PNG with no metadata. It's an upscale as much as a skin pass. The
runner keeps `enhance` results as a JPEG (quality 92) of at most 4096 px: 2.8 MB, made in about 3 s.
The automatic pass on Director anchors isn't built.

## Elements (Character vault, Elements)

A third path in the create wizard: Photos (1 to 6, no face checks, an outfit/prop/location choice
and a trademark warning), Sheet, Describe, Save. Saved with `kind: "element"`, `elementType`,
`origin: "photos"`, no identity and no consent. The sheet is product-style: outfits on an invisible
mannequin, props on grey, locations empty. The file's four view slots keep their names, with labels
per type (an outfit's `profile` is its Back, a location's `front` is its Wide). "Save as element" on any
still adds it to the element wizard as a photo. Elements go into a cast as `{outfit}`, `{prop}` or
`{location}` and send their composite.

**A refusal in the prompt.** The first view prompts said "leave out any logo, brand name, mascot or
trademarked design". Every single view came back `content_policy_violation` with no detail (four of
four, twice), while the composite with the same sentence went through. Each reference alone with the
sentence was refused too; without the sentence the view drew. "No logos or brand names" in the closing
line passes on views and the composite, so every element prompt now uses that. Test element: a designed
leather satchel drawn at 1K fast; the export and import round trip gives the same files and a
byte-identical second export.

## Export 9:16 (Remix links, Social export; Recast, Result view)

`lib/media/social.ts`: one clip fitted into 720×1280 on Studio grey, or a Recast's original and result
in one frame, stacked or side by side (whichever shows them larger). Labels ("Original", "Recast") and
the end card ("Made with Portraius Studio", "Open source") are drawn on a canvas in Big Shoulders and
Atkinson with the token colours, then laid over by ffmpeg. The end card is on by default, with a
checkbox to drop it. 720p rather than 1080p, as with Director (row 15). An 8 s H3 recast exported in
34 s (0.85 MB). The button is on every clip in the library and under each Recast result.
