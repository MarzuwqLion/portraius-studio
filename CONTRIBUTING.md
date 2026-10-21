# Contributing

The easiest way to add to Portraius Studio is a preset: a JSON file that fills in a studio screen with
one click. Code changes are welcome too; open an issue first for anything large.

## Add a preset

1. Copy `presets/_template.json` into the folder for its type:

   | Folder | For |
   | --- | --- |
   | `presets/image/` | Image studio templates |
   | `presets/video/` | Video studio templates |
   | `presets/recast/` | Recast templates (Motion transfer, Object swap, Setting, style) |

2. Rename it to your preset's `id`, for example `presets/image/rainy-bus-stop.json` with
   `"id": "rainy-bus-stop"`. IDs are lowercase letters, numbers, dots and dashes.
3. Fill it in:
   - `title`: what the picker shows, up to 60 characters.
   - `author`: your GitHub handle. `license`: keep `CC0-1.0` so anyone can reuse it.
   - `recipe.prompt`: name cast members with slots, `{lead}`, `{second}`, `{third}` for people, and
     declare each one in `recipe.slots`. Elements (outfits, props, products) use their own slot name,
     like `{product}` with `"kind": "element"`.
   - `recipe.camera`: optional picks from `presets/camera/` (`size`, `angle`, `lens`, `aperture`,
     `movement`, `lighting`, `genre`, `body`, `era`, `pacing`) and `look` from `presets/looks/`. Use
     the option `id`, not its label.
   - `recipe.params`: `aspectRatio` for images; `mode`, `durationSec` and `ratio` for video; see the
     existing files in `presets/recast/` for Recast.
4. Optional thumbnail: a WebP next to the JSON, named in `"thumbnail"`, under 200 KB. Make it with a
   designed character from the app (**Design from a description**), never a photo of a real person.
5. Run the check, then open a pull request:

   ```sh
   npm ci
   npm run presets:check
   ```

The same check runs on every pull request that touches `presets/`.

## Rules for presets

- No brand names, logos, trademarked characters or real people (celebrities included). The check
  catches the obvious ones; review catches the rest. Invented names are fine.
- Safe for work. Providers' safety filters stay on and refusals aren't worked around.
- Models must be ones the app allows (`src/lib/registry/models.ts`).

## Code

- `npm run dev` for the app, `npm test` for unit tests, `npm run typecheck` before a pull request.
- `docs/SPEC.md` is the source of truth; its Contracts section (routes, module boundaries, the job
  state machine, the Dexie schema) changes only by discussion in an issue.
- Never commit an API key. The app takes the key from each visitor in Settings.
