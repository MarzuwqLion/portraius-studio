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
