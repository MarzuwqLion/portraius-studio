# U4 notes: check

Run on October 21, after U3: `npm run shots` (all three passes), a keyboard-only pass over the
judges' path, and the main screens at 200% zoom on a 1280×800 screen (a 640×400 viewport at 2×).
Only blockers were fixed; the rest is listed for later.

## Fixed

| Where | Problem | Fix |
| --- | --- | --- |
| Prompt editor | Reached by Tab, the caret sat at the very start, in front of a leading chip, and End didn't move past it, so typed words went before "Walt Harmon". | Keyboard focus puts the caret at the end (a click still places it where it lands), and only while the editor keeps focus, so Tab moving on isn't pulled back. |

## Keyboard pass

- **First run:** the eight rail links, then "Take the tour (no key)". Enter opens the Tour.
- **Tour:** "Add your key", then the chapter list (7 buttons; Enter scrolls to the chapter), then each
  chapter's "Try this with Walt". Enter adds Walt and opens the studio.
- **Image with Walt:** the preset tiles, "Remove Walt Harmon", the prompt (caret at the end); @ opens
  the vault, arrows and Enter pick, the chip lands, Tab moves on through the controls to the footer.
  Without a key the footer's first stop is "Add your Comfy API key", and Generate is disabled.
- **Director:** folded shot rows are one button each; Enter opens one and folds the open one; the move
  and remove buttons on every row reorder by keyboard; the timeline frames open their shot. Export
  scene is reachable once every shot has a finished take (disabled, so skipped, before that).
- Every stop shows the focus ring: cognac on proof, the set's own text colour on Studio grey.

## 200% zoom at 1280×800

No screen scrolls sideways. On Image, Video and Recast the Generate footer stays in view. Below
768 px the layout is the phone one: the rail moves to a bottom bar, and the call sheet, the footer,
the activity line and the bar share 400 px, which leaves little room for the controls (they scroll).
Usable, not comfortable.

## Not blockers, for later

- No "Skip to content" link: every screen starts with the eight rail links (the `nav` and `main`
  landmarks are there for screen readers).
- In the Tour, Tab goes from the chapter list straight into the first chapter, not the one just
  scrolled to (DOM order).
- At 200% zoom the call sheet is cramped between the footer, the activity line and the bottom bar; a
  collapsible footer note would win back a line.
- The open shot's own move buttons are labelled "Move shot earlier" without its number (the folded
  rows say "Move shot 2 earlier").
- Preset tiles at phone width are three across, so each is large; two rows of four would read
  better.
- "Try this with Walt" on the Director chapter makes a new scene each time it's pressed, so pressing
  it twice leaves two "The Letter, again" cards.
