# UI pass (October 21)

Folded into docs/SPEC.md on October 21 (U0); from here the spec wins, and this file is the record of what was asked.

Decided by Marzuwq on October 21, after three UI/UX reviews of the October 20 build (scores 6.3, 6.5 and 7.8; target 8.5). This file amends docs/SPEC.md. Until U0 folds it into the spec, this file wins where the two disagree. Contracts are unchanged.

What the reviews agreed on: at 1440×900 the Generate button is below the fold; "price unknown" sits on every paid button; the jobs tray fills with finished jobs; `{lead}` is template syntax a visitor has to learn; presets are a text list; a visitor with no key lands on a checklist with half the screen empty; and the look is grey on grey with no identity.

## Decisions (October 21)

1. **Generate footer.** On Image, Video and Recast, the primary button, its price, and the reason it's disabled ("Pick a character", "Write a prompt", "Upload a clip") sit in a footer pinned to the bottom of the call sheet. The controls scroll above it. Cmd/Ctrl+Enter runs it. Why: the main action should never need scrolling to find.
2. **Prices.** When Router's /estimate returns nothing, fall back to a static table in `src/lib/jobs/estimate.ts`, keyed by model and the inputs that change the price (resolution, duration, count), shown as "≈ $0.12". Table values come from Comfy's published pricing, with the source for each row in docs/notes/u1-notes.md. A model with no published price shows no price at all, and the screen shows one line: "Prices aren't available for this key; Comfy bills your account as usual." Never show "free", "local" or credits. Why: a known cost removes hesitation; a wrong one destroys trust.
3. **Activity.** The tray shows working and failed jobs as it does now. Finished jobs collapse into one "14 done" control that expands into today's film strip. With nothing running, the tray is a single line. Why: the strip exists for unfinished work; finished jobs turn it into noise people learn to ignore, failures included.
4. **Colour.** Cognac and plum go on panels, rail and accents. Media stays on neutral grey (no hue), darker in the dark theme. Default theme is Dark; Light and Match system stay in Settings. Why: "Why grey" still holds. Skin tones are the product, and a tinted surround shifts how skin reads, so the identity goes in the chrome, not behind the work.
5. **Selection.** The grease mark turns cognac and always comes with a text label, "✓ Selected", under the picked take or anchor. Why: the mark is 2.4:1 on light Studio grey, so hue alone can't carry it.
6. **Cast before prompt, and @mentions.** Cast sits above Prompt on Image, Video and Recast. Typing @ in a prompt or a Director action offers the vault, and a mention renders as a chip with the character's face. Stored prompts, recipes and the prompt compiler keep `{lead}` slots; chips are only how the editor shows them. Why: people pick who, then write what; nobody should have to learn brace syntax.
7. **Score wording.** "Likeness 94". Bands read Strong, Review and Drifted (same thresholds: 80 and 60). Whole numbers everywhere, videos included. "worst frame 92" becomes "Lowest frame 92". An ⓘ next to the score says it compares the face to the character's references and says nothing about hands, action or overall quality. A drifted video gets a Re-roll button. Why: "Check" reads as passed; decimals claim precision a 1 fps face score doesn't have.
8. **Labels.**

| Now | New |
| --- | --- |
| Still first | Image, then animate |
| From image | Animate an image |
| References | Use references (with one line on what they control) |
| Continue | Continue from last frame |
| Speak | Add a line |
| Import file | Import .portraius |
| Motion Transfer, Object Swap | Motion transfer, Object swap |
| 768P | 768p |
| New background (under Object swap) | moves to a Setting group |

9. **Model routing.** Under the Video model picker: "People in the shot render on MiniMax H3." Why: today the picker says Seedance and the takes say H3, which reads as the app ignoring the choice.
10. **Preset tiles.** Image, Video and Recast presets show as tiles with a thumbnail (the `thumbnail` field in `_template.json`, unused so far). Video and Recast tiles play a short muted loop on hover and on focus. Thumbnails use Walt Harmon.
11. **First run leads with samples.** The right side of the first-run screen plays the Recast side-by-side from public/samples/. Two buttons of equal weight: "Take the tour (no key)" and "Add your key". The Tour gets a sticky chapter list, and each chapter ends with "Try this with Walt", which adds Walt if needed and opens that studio with Walt cast and the matching preset picked.
12. **Recast stage.** With no clip, the whole set is a drop zone with the before/after loop playing behind "Drop a clip, or try the sample".
13. **Director.**
    - Only the selected shot shows its full form. The others collapse to one row: anchor thumbnail, first line of the action, and a summary such as "Wide · 35 mm · Static · 5 s".
    - Camera settings collapse to that summary and expand on click.
    - The timeline is pinned to the bottom of the Director set.
    - Scene cards show the first anchor as a cover, plus "3 of 3 ready".
    - "Draft shots with AI" sits next to the logline and says whether it adds to or replaces existing shots.
    - An export ends on a large player with Download, Export 9:16 and Open in library, labelled "Export 2 · 14 s · crossfades" instead of a timestamp.
14. **Polish.** `:focus-visible` instead of `:focus` on the rail and buttons; no truncated select values at 1280 px ("Digital cinema" fits); `object-fit: cover` on prop and element cards; Characters becomes "Cast and elements" with People and Elements tabs.

### Out of scope for this pass

A second palette or accent toggle. Library search, favourites and version groups. A full Director layout rebuild (preview, inspector and storyboard), unless U1 to U3 are done by the evening of October 26. Any Dexie version change: if a decision seems to need one, STOP AND ASK.

## Colour tokens (replaces Visual direction → Colour tokens)

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--seamless` | `#64676B` | `#2E2F31` | Behind every image and video. Neutral, never tinted |
| `--proof` | `#F7F3EE` | `#221A24` | Panels, rail, dialogs |
| `--ink` | `#2E2131` | `#F2ECE6` | Text and icons |
| `--rule` | `#887785` | `#806C7E` | Dividers, print outlines, input borders |
| `--accent` | `#A65C35` | `#A65C35` | Primary button fill, focus ring, active rail item |
| `--on-accent` | `#FFFFFF` | `#FFFFFF` | Text on `--accent` |
| `--accent-text` | `#A65C35` | `#D08A5C` | Links and accent text on `--proof` |
| `--grease` | `#E3955F` | `#E3955F` | Selection marks only, never text |
| `--match` | `#4F6B34` | `#9BBF7A` | Likeness 80 to 100 |
| `--check` | `#7A5A00` | `#E8C25A` | Likeness 60 to 79 (moved toward yellow so it doesn't read as the accent) |
| `--drift` | `#A3313A` | `#F08A90` | Likeness under 60, and errors |

Measured (WCAG relative luminance): ink on proof 13.8:1 light, 14.4:1 dark. Text on seamless 5.2:1 light, 11.4:1 dark. On-accent on accent 5.0:1. Accent text on proof 4.5:1 light, 6.0:1 dark. Rule on proof 3.8:1 light, 3.5:1 dark. Match, check and drift on proof at least 5.4:1 in both themes. Grease on seamless 2.4:1 light (carried by the "✓ Selected" label), 5.6:1 dark.

Add to `tokens.test.ts`: on-accent on accent ≥ 4.5, accent-text on proof ≥ 4.5, rule on proof ≥ 3. Point the primary variant in `src/components/ui/button.tsx` at `--accent`.

## Working rules for this pass

- Work on a branch, `ui-pass`. Merge to main only at the end of a milestone, after `npm run typecheck && npm test`, `npm run shots`, and Marzuwq's look at the shots. Main deploys to Pages, and judges can visit at any time, so a half-finished re-skin must never go live.
- One commit per numbered decision.
- Leave prompts, adapters, the job state machine, consent records, stored assets and Contracts alone unless a verified bug needs a change.
- Any step that spends money on Router calls is STOP AND ASK, with a list of calls and an estimated cost.

## Milestone prompts

Paste one at a time, in a fresh session, in plan mode.

**U0: Spec and screenshots (Oct 21)**

```
Read CLAUDE.md and docs/ui-pass.md, then these docs/SPEC.md sections: Decisions and defaults,
UI and UX, Visual direction, Identity match score (Bands and actions), Presets and recipes
(Preset file), Build order for Claude Code.
Fold docs/ui-pass.md into docs/SPEC.md in the spec's voice: add "Decisions (October 21)";
replace the Colour tokens table and update "Why grey"; update the Layout sketch (Generate
footer, activity control), Signature: grease-pencil marks, Copy rules, and the score band
names; add U0 to U4 to Build order ahead of M8. Do not touch Contracts.
Then add npm run shots: a Playwright script that screenshots every route at 1440x900 and
1280x800, in light and dark, once in a fresh browser and once after adding Walt from the
Tour, into shots/ (gitignored).
STOP AND ASK: show me the spec diff and list anything in ui-pass.md that conflicts with the
spec or Contracts. No UI code until I approve.
```

**U1: Every screen (Oct 21 to 23)**

```
Read docs/SPEC.md: Decisions (October 21), Visual direction, UI and UX, and src/lib/jobs/estimate.ts.
On branch ui-pass, build decisions 1 (Generate footer), 2 (prices), 3 (activity), 4 (tokens),
5 (selection label) and 14 (polish), one commit each.
For the price table, take values only from Comfy's published pricing and cite each row in
docs/notes/u1-notes.md. STOP AND ASK for any model without a published price.
Done when typecheck and tests pass, the new contrast pairs are in tokens.test.ts, and
npm run shots shows the Generate button and its price without scrolling on Image, Video
and Recast at 1440x900 and 1280x800 in both themes. Then STOP AND ASK me to review the shots.
```

**U2: The judges' path (Oct 24 to 26)**

```
Read docs/SPEC.md: Decisions (October 21) items 6 to 12, Presets and recipes, Identity match
score, and UI and UX (Screens: First run and Tour).
Build, one commit each: cast before prompt with @mention chips (the stored prompt keeps
{lead} slots; the compiler and recipes don't change), score wording, the label changes,
the routing note, the first-run screen, Tour chapters with "Try this with Walt", the Recast
drop zone, and preset tiles rendered from each preset's thumbnail field.
Thumbnails cost Router calls: STOP AND ASK with the list of presets, the model per
thumbnail and the estimated total before generating any. Use existing public/samples/
clips for Recast loops where they fit.
Done when a fresh browser can go first run, Tour, "Try this with Walt", and reach an Image
screen with Walt cast and a preset picked, without typing a brace, and shots show it.
```

**U3: Director (Oct 26 to 27)**

```
Read docs/SPEC.md: Director, and Decisions (October 21) item 13.
Build, one commit each: collapsed inactive shots with a camera summary, the pinned timeline,
scene cards with cover and readiness, Draft shots with AI beside the logline with its
add-or-replace note, and the new export ending.
Done when a 3-shot scene can be edited, reordered and exported without scrolling past more
than one open shot form, and shots show it at 1440x900.
```

**U4: Check (Oct 28), then M8 as planned**

```
Run npm run shots and a keyboard-only pass of first run, Tour, Image with Walt, Director
export; check 200% zoom at 1280x800. Fix only blockers and list the rest in
docs/notes/u4-notes.md. Then continue with M8 (U2 covers M8's Tour work).
```
