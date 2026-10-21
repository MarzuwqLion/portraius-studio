# U5 notes: fixes from the October 21 review

Built on branch `ui-pass-u5`, one commit per item, after adding "Decisions (October 21, U5)" to the
spec, changing Recast → Input to match items 1 and 2, and adding U5 to Build order. No Dexie version,
no Contracts change, no change to the recipe or `.portraius` format, and no Router call.

## What changed

| # | Item | What it does |
| --- | --- | --- |
| 1 | Recast takes the whole clip | A clip prepares as soon as it arrives (upload, library pick, drop, "Try the sample", the Tour). One that fits is used whole; a longer one uses its first `maxSec` seconds with "Using the first 15 s. Trim to pick a different part."; a shorter one stays unprepared with "Recast needs a clip of at least 4 s." Trim is folded under "Trim (optional)" and re-prepares when a slider is let go (pointer up, key up or blur); the sliders never let the length pass the mode's maximum. A preset the trim doesn't fit goes back to the first allowed seconds. Preparing runs one clip at a time, and a request overtaken by a newer one is dropped. The footer reads "Preparing the clip, 40%" while it runs, with the price from the raw length. `recastNeeds` now says "Preparing the clip" and "Recast needs a 4 to 15 s clip"; the tests cover both, and that it never asks the visitor to prepare or trim. New helpers `defaultRange` and `tooShort` in `lib/studio/recast.ts`. |
| 2 | No rights check for the sample | The bundled sample shows "The sample ships with Portraius Studio, so there's no rights check." Any other clip brings the checkbox back unticked. |
| 3 | The Recast set shows the clip | Once a clip is in, the set shows "Original" over the clip (muted, looping, held on a frame under reduced motion) and "Recast" over the performer's front view, the replacement image, or for a style swap without a person, the preset's still, captioned "Plays here after you run it." (or "Pick a performer to see who plays it."). The call sheet keeps a thumbnail and Replace clip. Earlier recasts list under it. |
| 4 | Every screen opens at the top | `AppShell` resets `<main>` and any `[data-scroll-top]` call sheet on push and replace, and restores the saved position on back and forward. `npm run shots` gains a 390×844 dark pass with three checks, and now exits with an error when any check fails. The phone checks found two more faults, fixed here: the Cast page's header buttons ran off the screen (headers now wrap), and on Image the prompt sat under the footer (tiles go four across on phones, two rows of four, with titles clamped to two lines). |
| 5 | Retry on the take | `OutputTake` puts Retry under a failed take's message when `job.error.retry !== "never"`; Video's own Retry in its clip actions went, so there's one. Component test added. |
| 6 | Character page | "Use in an image", "Use in a video" and "Use in a recast" under the name, through the Launch state with the character cast and no preset. A locked import shows its locked note instead. |
| 7 | Empty studios | Image and Video with no takes show the picked preset's example large ("Example: Film still with Walt Harmon, a designed character. Your takes appear here."), or the first three presets as large tiles that pick on click. Director with no scenes has "Start from the sample scene" beside New scene and a card for The Letter, with the Tour film's opening frame as its cover. |
| 8 | Video at 5 s | The default draft is ≈ $0.74; presets with their own length keep it. |
| 9 | Posters | A first-frame `.webp` beside every `.mp4` preset thumbnail (8) and sample clip (7), 4 to 71 KB each, used as `poster` in preset tiles, the empty-set examples, the Recast drop zone and split views, the Tour and first run. `presets:check` requires it under the 200 KB cap (tested); the Tour test requires one per sample clip. New `npm run posters` makes them from the existing files in a headless browser with the app's ffmpeg.wasm (no Router call, no key, and no H.264 decoder needed); `npm run thumbnails` writes one with every loop. CONTRIBUTING.md says so. |
| 10 | Selected take | The action bar starts with a 40 px thumbnail and "Selected take". "✓ Selected" and the Likeness chip share one row under the take (`Take` takes `selectedLabel={false}` when its caller places the label). |
| 11 | Remix example | `matchingPreset` in `lib/studio/remix.ts` finds the shipped preset with the same model and prompt whose params all match; its thumbnail shows above the recipe card, captioned "Example with Walt Harmon, a designed character. Your cast fills the slots." Tested. |
| 12 | Copy | All seven rows. The prompt chips use a new `castOfTake` (tested) and `slotChips`: the job's own cast when it kept one, or one character for one slot. Director's folded rows now show faces in their chips too. Library prints use names in their alt text. The bottom bar uses a new `--size-tab` token (11 px) under 400 px; every label fits at 360 and 390 px. |
| 13 | Director | The open shot's camera line drops the length (`shotSummary(shot, { length: false })`); folded rows keep it. The Tour's Director handoff reopens its sample scene while no shot has a take (`untouchedSampleScene`, tested). |
| 14 | Skip link | "Skip to content" is the first focus stop, shown only on focus, and moves focus to `<main>` (`tabIndex={-1}`, no outline). A shots check presses Tab and Enter on four screens. |

## Calls made without asking

- **Item 1, trimming the start.** Moving only the start slider keeps the end where it was, so the
  clip gets shorter; dragging past the maximum pulls the other end along.
- **Item 1, switching presets.** A trim the visitor made is kept when the new mode allows its
  length (it's prepared again only if the frame rate or size differs); otherwise it goes back to
  the first allowed seconds, with the note.
- **Item 3, Object swap with no image yet.** The right half says "Upload a replacement image to see
  what goes in." The item named captions only for the performer cases.
- **Item 3, the frame.** Original and Recast sit side by side, each at the clip's shape, under the
  result view's labels, instead of sharing one wiped frame, so the whole clip shows.
- **Item 4, phone tiles.** Four across with the first eight shown (six on wider screens), from the U4
  notes' "two rows of four would read better", to keep the prompt above the footer.
- **Item 6, elements.** An element's page has "Use in an image" and "Use in a video" only: Recast
  casts a person as its performer, and Object swap takes an uploaded image, not a vault element.
- **Item 7, cover.** "The Tour's first anchor" is the opening frame of The Letter (its poster from
  item 9), the frame shot 1 animates from. The card names Walt Harmon because that button adds him.
- **Item 7, sample scene.** "Start from the sample scene" goes through the Tour's own
  `tryWithWalt`, so it also reuses an untouched sample scene (item 13). It shows only while there are
  no scenes, as the item says.
- **Item 11, params.** "Same params" is read as: every param the preset sets has the same value in
  the recipe. A recipe shared from a preset's take also carries size, quality and count, which the
  preset doesn't set; a strict match would never show the example.
- **Item 12, the take page.** A take whose job kept no cast, with two or more people, shows "@lead"
  rather than guessing who is who.
- **Shots.** Truncated select values, the fold check, and the new checks now fail the run (exit 1),
  and the dev server runs without file watching, so an edit elsewhere can't reload the page
  mid-run. Images hidden at the current width (phone-only preset tiles) aren't waited for.

## Checks

- `npm run typecheck` and `npm test`: 46 files, 384 tests pass.
- `npm run presets:check`: 48 preset files pass, posters included.
- `npm run shots` (fresh, walt, work; 1440×900 and 1280×800 in both themes, 390×844 dark): every
  check passes, 65 fold checks and 175 others. The shots show Recast after the Tour's "Try this
  with Walt" with the clip on the set and only "Add your Comfy API key" in the footer, the empty
  Image set with the Film still example, and the Video footer at ≈ $0.74.
- The first full run failed one check: in the work pass, with a queued and a failed job in the
  activity row, the prompt on a phone ended 9 px under the footer. The call sheet's top padding and
  field gaps are tighter on phones now (a separate commit), and the rerun passes.

## Left undone

- `THUMBNAIL_CAST` ("Walt Harmon", in `components/studio/EmptyExample.tsx`) and the sample-scene
  card name the designed character. When Marzuwq's sample character replaces Walt (M8), change both
  with the thumbnails.
- A new navigation leaves keyboard focus where it was (on the rail link pressed), so the next Tab
  goes on from there; the skip link is first in the document, not refocused on every route change.
- On the take page the 22rem side column is too narrow for Make it real and Realism strength on one
  line, so the slider wraps under its button (still one group, and still beside it, not beside
  Save as element).
- Stale prepared clips from earlier trims stay in the blobs table until the visitor deletes data,
  as "Prepare again" left them before.
