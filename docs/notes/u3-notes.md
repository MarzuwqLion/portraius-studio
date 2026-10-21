# U3 notes: Director

Decision 13 (October 21), one commit each:

| Change | What it does |
| --- | --- |
| Scene cards | Each card leads with the first anchor still in the scene as its cover ("No anchor yet" on grey without one) and ends with "3 of 3 ready", counting shots with a finished take, final or line. |
| Draft shots with AI | Sits under the logline it works from, in the call sheet. Its note says what it does to the shots already there: "Adds 3 to 6 shots after the 3 here; nothing is replaced." (`draftShots` appends; it never replaces.) |
| Folded shots | Only one shot shows its whole form. The others fold to one row: the anchor (or, for a continued shot, the frame it starts from), "Shot 2", its status, the first line of its action with cast names instead of slots, and "Medium close-up · 50 mm · Slow push-in · 5 s". A click, or Enter, opens it. A new shot opens itself. In the open shot the camera folds to the same line and opens on click. |
| Pinned timeline | The set scrolls; the timeline stays pinned under it with the strip, "2 of 3 ready", crossfades and Export. A frame in the strip opens its shot; dragging still reorders, and the arrows on every row do the same by keyboard. |
| Export ending | The newest export plays large, named "Export 2 · 14 s · crossfades" (or "straight cuts"), with Download, Export 9:16 and Open in library under it; earlier exports fold into a short list. A new export scrolls into view. The length and the crossfade choice are kept on the scene (`exportInfo`, in the scene's own JSON in the blobs table), so no Dexie version changed. |

Done check: on the seeded three-shot scene in `npm run shots -- work` (`director-work`,
`director-export`) and the Tour's sample scene (`director-scene`), editing a shot, opening another,
reordering from the folded rows and reaching Export never passes more than the one open shot form,
at 1440×900 and 1280×800 in both themes.

Not done: the full Director layout rebuild (preview, inspector and storyboard) stays out of scope;
it was conditional on U1 to U3 finishing by the evening of October 26.
