# U0 notes: the UI pass in the spec

docs/ui-pass.md is folded into docs/SPEC.md (Decisions (October 21), Visual direction, UI and UX,
Identity match score, Presets, the studio sections and Build order). Contracts are byte-for-byte
unchanged. Marzuwq asked on October 21 not to stop for UI decisions, so the conflicts below were
settled with the call written next to each one rather than held at U0's stop.

## Conflicts with the spec or Contracts, and the call made

| # | Where | Conflict | Call |
| --- | --- | --- | --- |
| 1 | Contracts, Routes | "Try this with Walt" opens Video and Recast with a preset picked, but only `#/image` takes `?recipe=`. Adding query strings to `#/video` or `#/recast` would change a Contract. | The Tour passes the preset and cast in React Router's navigation state, not the URL. Routes don't change; a reload simply drops the preselection. |
| 2 | Contracts, Error mapping | `NotEnabled` says "for /estimate, hide the price silently"; decision 2 shows a static "≈" price instead. | Read as compatible: no error is shown either way. The static table fills the price; `NotEnabled` stays silent. |
| 3 | UI and UX, Cost | Settings shows "Spent this session: N credits"; decision 2 says never show credits. | U1 shows it in dollars at Comfy's published credit rate, or removes it if no rate is published. |
| 4 | Visual direction, Colour tokens | The theme followed the system; now Dark is the default. | `DEFAULT_SETTINGS.theme` becomes "dark". The settings row needs no Dexie version: a visitor who saved Settings before keeps the theme stored there. |
| 5 | Presets, Contribution flow | Video and Recast tiles play a loop, and `presets:check` caps thumbnails at 200 KB. | The `thumbnail` for a video or Recast preset is a muted MP4 of about 3 s at 360 px on the long side, under the same cap. Image presets use a WebP or JPEG still. |
| 6 | Visual direction, Signature | "Nothing else in the app uses `--grease`" and the circle was "the one bold element"; now the accent is cognac too. | The grease mark stays the only `--grease` use. The intro now names cognac as the studio's one colour, shared by the primary action, the focus ring, the active rail item and the mark. |
| 7 | Copy rules | "No emoji" against "✓ Selected" and the ⓘ. | Both are text symbols, not emoji presentation; the copy rules now name them as the only two. |
| 8 | Details that matter, Keyboard | `G` generates; decision 1 adds Cmd/Ctrl+Enter. | Both. Cmd/Ctrl+Enter also works inside the prompt, where `G` can't. |
| 9 | Identity match score | Video drift had a "Retry draft" button; H3 clips have no draft. | "Re-roll": the same request with a new seed, on any drifted video. |
| 10 | Tour data | `tour.json` holds a 89.5 score; decision 7 says whole numbers everywhere. | The display rounds; the file isn't rewritten. |
| 11 | Characters | Becomes "Cast and elements", and the rail label has 96 px. | The route stays `#/characters`; the screen title is "Cast and elements" and the rail says "Cast". |
| 12 | Spend | U2's thumbnails cost Router calls (a STOP AND ASK in ui-pass.md). | Kept to Nano Banana 2.1 at 1K Fast for stills, and existing `public/samples/` clips for loops where they fit; the list and the cost are in u2-notes.md. Anything over a few dollars still stops. |

## Things the tokens table doesn't say

Checked against the hex values on October 21; every figure in ui-pass.md is right to the decimal.
Two pairs it doesn't list:

- `--accent` on light `--seamless` is 1.14:1. A focus ring inside the set (on Studio grey) uses
  `--on-seamless`; a primary button in the set keeps its label contrast (5.0:1) but its edge melts
  into the grey. The spec now says so.
- `--accent` as a focus ring on dark `--proof` is 3.39:1, which passes WCAG's 3:1 for focus
  indicators.

## npm run shots

`scripts/shots.ts` starts the Vite dev server on port 5199 and runs three passes, each in a new
browser profile: `fresh` (nothing stored, no key), `walt` (after the Tour's "Add Walt Harmon to
your vault" button, plus one new Director scene with three shots), and `work` (Walt plus three
finished stills, one H3 clip, one failed and one queued job, made from the Tour's own sample files
and written through the app's own Dexie module so the live queries see them). Every route is shot at
1440×900 and 1280×800 in light and dark, with reduced motion so nothing is mid-fade. No key, no
Router call. Pass names as arguments run only those passes (`npm run shots -- work`).

The script also checks that the primary action on Image, Video and Recast sits inside the viewport,
and writes `shots/report-<passes>.md`. On the October 20 build it fails all 12 checks: the button
bottoms are at 1181 px (Image), 1048 px (Video) and 1008 px (Recast).
