# Seedance 2.5 takes a person through its virtual library (October 28)

Asked after reading Marzuwq's "Haunted Subway" workflow, which sends two realistic turnaround sheets and a 21 s
blockout to Seedance 2.5 through ComfyUI's **ByteDance Seedance 2.5 Reference to Video** node. M3 found that
Seedance refuses any image of a realistic person (m3-notes.md), which is why every video with a cast renders on
MiniMax H3 (Decisions, October 19).

## How the ComfyUI node gets a person past Seedance

The node (`ByteDance2ReferenceNodeV2`, `comfy_api_nodes/nodes_bytedance.py` in ComfyUI master) never sends an image
inline. It uploads each reference image and video to a per-account **Seedance virtual library**
(`POST /proxy/seedance/virtual-library/assets` with a public URL and a hash), waits for the asset to turn `Active`
(`GET /proxy/seedance/assets/{id}`), and sends it as `asset://<id>`. It also sets `omni_reference_task_type`, which
Router's schema doesn't expose.

## Tests

Walt Harmon (designed character), 480p Seedance 2.5 drafts, no audio, seed 7, the shell's `COMFY_API_KEY`:

| Test | Request | Result |
| --- | --- | --- |
| A. Walt's turnaround sheet inline (`data:` URI) as `reference_image`, through Router: what the app sends today | `c5e153c2-2fe1-44a7-8412-d4cb1150350e` | `content_policy_violation` in 13 s, as on October 19 |
| B. The same sheet uploaded to the virtual library, sent as `asset://` through Router, same prompt | `61bd2f42-e329-4fac-8a9f-d456ad6b0250` | Rendered in 88 s: Walt walking a harbour pier at dusk, plainly him (hair, beard, peacoat) |
| C. The sheet plus `diner-window-draft.mp4` as a `reference_video`, both `asset://`, through Router | `8ff2d1cf-390e-4bfa-8ad8-0c9a09ed6fea` | Rendered in 87 s, 5 s long: Walt reading a letter in the clip's diner booth by its rainy window |

- The library upload took about 3 s to turn `Active`. Uploading the same file again returned the same asset ID (it
  dedupes by hash), so a character's sheet is uploaded once.
- Router reads `asset://` IDs from the library: the partner proxy wasn't needed, and `omni_reference_task_type`
  wasn't sent.
- The stand-in reference clip has a small figure (the waitress) in the background, and it went through too. A real
  grey Blender blockout wasn't available, so blockout-specific behaviour (following a grey proxy's moves and a
  camera path) is still untested.
- With a reference video, the app's adapter sends `duration: -1` and `ratio: "adaptive"` (M1); Seedance chose 5 s.

## What it would change

- **Seedance could render a cast.** Through the library, Still first, Use references, Director takes and blockouts
  with a person could run on Seedance 2.5 (4 to 30 s, audio, draft then final) instead of MiniMax H3 (4 to 15 s).
  That reverses the October 19 rule and the CLAUDE.md line "Any video with a real person in its cast or a face in
  its first frame renders on MiniMax H3", so it's Marzuwq's decision. Not changed.
- **Only a designed character was tested.** A photo-based character from the vault (a real person) hasn't been;
  BytePlus may screen real faces differently. The node's other path, a face-verification link
  (`/proxy/seedance/visual-validate/sessions`), suggests real likenesses can need the person's own check.
- **Open for the app:**
  - The library needs a public URL for each file. Router's asset upload (`uploadAsset` in `lib/router/client.ts`),
    which Recast already uses, could provide one.
  - Whether `/proxy/seedance/*` answers a browser (CORS) is unknown. If it doesn't, the Worker would forward it.
  - Library assets stay in BytePlus storage (ap-southeast-1) after the render. How to delete them is unknown; the
    Privacy section would need a line before real people's sheets go there.
- The test scripts are in `.checks/` (gitignored). The two library assets from these tests are Walt's sheet and
  the sample diner clip; both are public samples from this repo.
