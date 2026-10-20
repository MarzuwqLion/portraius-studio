# M7 notes: chaining, one-take, voice and lip sync, the Director agent, the node pack

All four M7 parts are built, in the spec's order. Run on October 20 with designed characters only (Walt Harmon
and the five M5 calibration people).

## Decisions

Five questions came up before M7 started. Marzuwq's answer was "go with your best recommendation":

| Question | Decision |
| --- | --- |
| Speech is sync-only: extend the job state machine, or keep it outside? | Outside. A spoken line is a direct call (`lib/jobs/direct.ts`) saved straight to the blobs table. No Contracts change. |
| Where does audio live in the library? | On the clip it was made for, as an `audio` asset. No new generation type. |
| Seedance refuses people: what is the second lip sync path, and row 17's fallback? | MiniMax H3 reference mode (the cast's sheets plus the line as reference audio), for both. Spec updated. |
| Sync Labs' download host may block browsers: update and redeploy the Worker? | Yes, and it did (below). |
| Node pack: publisher, permission to publish, local ComfyUI? | Built and tested in a local ComfyUI (CPU torch in a scratch venv). Publishing is a manual workflow that waits for Marzuwq's Comfy Registry publisher and its key. |

## Director chaining

A shot set to start with the previous shot's last frame animates from that frame (the previous shot's lip sync or
final once done, else its take) instead of an anchor still. If that take isn't done yet the shot waits and starts
when it is, so a whole chain can be started at once. A continued take is marked stale when the shot before it is
re-rolled or moved. The export cuts straight into a continued shot (no crossfade) and drops its first frame, which
repeats the previous shot's last one; stream-copy joins keep it (one frame, 42 ms).

**A bug found in testing.** The first version cleared the wait before the take was recorded. A page reload in
between (Vite's, here) left the shot neither waiting nor animated. Now the flag stays until the take is recorded,
and a Web Lock keeps two tabs from starting the same shot.

**Check:** a two-shot scene, no cast: rain on a diner window, then "the camera drifts along the window toward an
empty booth", continued. Nano Banana put a small figure in the booth, so the face check sent both shots to H3
768P. Shot 2 started from shot 1's saved last frame, through the same function the job listener calls. Export:
8.875 s, which is both 4.458 s takes minus the dropped frame, with no overlap although crossfades were on. Mean
frame-to-frame change at the join stayed at most 4.7 (shot 2's dolly starting), against about 14 for camera
moves inside shot 2: no jump at the cut, and the frames either side show the same framing.

## Kling one-take

"Shoot as one take" sends every shot to Kling V3 Omni's `multi_shot` at 720p (`std`): one prompt per shot (512
characters at most, built by `compileOneTakeShots` with Kling's `<<<image_n>>>` tokens for the cast), the cast's
sheets and photos as references (7 at most; past that people keep their sheet and lose their photo), scenes over
15 s shortened to fit, 21:9 shot at 16:9.

**Probe (request `1ef377a5-4430-4cff-8351-aa680ee9031a`):** two 2 s shots with Walt's sheet and front view as
references, 131 s. Kling accepts references with `multi_shot` and `index` is 1-based. The clip (4.04 s, 1280×720,
24 fps) has the wide of Walt in the booth, then a cut to a close-up as he looks up and smiles. Results come from
`v15-kling-fdl.klingai.com` with `Access-Control-Allow-Origin: *`, but the site's CSP didn't list Kling's CDN, so
`*.klingai.com` is in it now. The panel was checked on screen; a one-take wasn't run again from the screen.

## Voices (Unknowns row 16: holds)

`npm run voices:check` speaks a line in every voice in `presets/voices.json` through Router. All 20 candidate
premade voices worked, about 2 s each. Twelve were kept, spread over pitch, accent and age. Each is described by
its measured median pitch (low under 140 Hz, high over 200 Hz) plus accent and age, and has a 4 s preview in
`public/voices/` (about 70 KB). A character can keep a default voice, picked in the wizard's Describe step or on its
page; the file format already had the field.

## Lip sync (Unknowns row 17: holds)

Both paths were tried on Walt with one line in Bill's voice: "I wrote this forty years ago. I never had the nerve
to send it." (4.56 s).

- **Sync-3** on his H3 close-up (request `5b6a5d60-1e25-4348-9df0-63f21b92e89e`): 106 s, 4.58 s out (cut to the line).
- **H3 reference mode** with his sheet and front view: as a data URI the line was refused with `provider_error` and no
  detail (requests `1d64960d-80b7-4728-be53-84dc90cc01a0`, `d812d7e6-dacf-4801-adc4-1130f7e40e79`). As a hosted link it
  worked: 213 s (request `a2738ae5-5a80-485d-b2be-60dbf183b98e`; audio alone, 205 s, `5eee1b85-dbf4-44a2-88a7-401ca2b6c6cd`).
  H3's output carries the line itself, starting about 1.1 s in.

To compare sync rather than eyeball it, `.checks/lipsync-score.ts` (run in the dev page) correlates mouth opening per
frame (inner-lip height over mouth width, face-api's landmarks) with the clip's own loudness, at the best lag
within a third of a second:

| Clip | Mouth vs audio (r) | Identity, median (worst) |
| --- | --- | --- |
| Walt's original close-up, not speaking | 0.02 | 95 (93) |
| Sync-3 on it | 0.28 at 83 ms | 90.5 (87) |
| H3, sheet and front plus the line | 0.62 at 0 ms | 100 (99) |
| H3, the line alone | 0.45 | not scored |

Sync-3 looks right (the mouth opens and closes through the line), so row 17 holds and its fallback isn't needed;
the spec's fallback is now H3 reference mode anyway. The new H3 clip followed the words more closely and kept
identity better, so on a clip with a cast the Speak panel offers "New speaking clip" first and "Lip sync this clip"
second. Lip sync is the way to make an existing clip speak, and the one Director uses.

**Sync Labs' download link** (`api.sync.so/v2/generations/<id>/result?token=...`) answers any request with an
Origin header, which every browser fetch sends, with a 500, and otherwise redirects to a presigned link on
`private-sync-user-generations-v2.s3.amazonaws.com`. Both are on the Worker's `/fetch` list now, and `/fetch`
follows a redirect only to another allowed link (at most two). Redeployed (version
`5f1e9d02-a4be-49db-8df1-e12eb57ba2ca`); the result came back through it with CORS for the Pages origin.

**In the app.** From Walt's clip in the library: the line was spoken in his saved voice (Bill), then both paths ran
from the Speak panel. H3 178 s, scored 100 (worst 100); Sync-3 111 s, scored 92 (worst 84). Each generation keeps
the video and its own copy of the line. The three hosted files were gone (404) once the jobs ended.

**Retrying a job whose inputs were hosted** sent links that no longer existed: a job's uploads are deleted when it
ends (Contracts). That was true of Recast since M4. Retry now hands such a job to its studio, which hosts the files
again and starts it linked to the failed one.

**Director lines.** A shot with a cast gets "Speak a line" once its take is done; Sync-3 lip-syncs the take (or the
final) and the export uses that clip. The Letter, with Walt's line on shot 3, exported at 14.17 s, with the line
clearly louder than the room tone over the last 4.5 s. The line was dropped again afterwards.

## Director agent

"Draft shots with AI" sends the scene card to Claude Sonnet 5.5 through Router's queue. Router's queue takes Claude
(a test call finished in 3 s), so the registry says queue. The reply is constrained by a JSON schema whose camera
fields can only be preset IDs, at medium effort. It's checked again in the app: shots naming anyone outside the
cast are dropped, bad picks fall back to defaults, at most 6 are kept, and they go after any shots already there.
The request ID waits on the scene, so a reload collects the plan. Anthropic's server-side refusal fallback needs a
beta header, and Router takes only the body, so a refusal shows a plain message instead.

**Check:** "An old harbour pilot walks the empty pier at dawn and decides to finally post the letter", Walt as
`{lead}`, calm pacing. About 20 s for six shots, from an extreme-wide crane-up at golden hour to a wide pull-back.
Every camera pick was a valid ID, the lengths ran 6 to 12 s, and only the envelope dropping into the post box was
marked to continue from the shot before.

## ComfyUI node pack

`custom_nodes/comfyui-portraius-characters`, on ComfyUI's V3 node schema, with three nodes.

- **Load Portraius Character** reads the file with the app's import checks and refuses a person from photos with
  no consent record.
- **Character Prompt** is a Python port of the prompt compiler. `npm run nodepack` writes the app's own output for six
  cases (two people, an element, edit mode, no cast, a stylised look, Kling's wording), and the Python tests match
  them word for word. References come out as one batch on Studio grey; the Nano Banana 2.1 partner node counts
  every image in a batch, so one input carries them all.
- **Identity Score** uses MTCNN and FaceNet (VGGFace2), vendored from facenet-pytorch 2.6.0 (MIT): that package
  pins torch below 2.3, which would downgrade ComfyUI's. The 107 MB weights are fetched once and checked against
  their SHA-256.

**Calibration**, on the M5 people (each scene matched to its portrait by the scene job's own reference image):

| Pairs | FaceNet distance |
| --- | --- |
| Same person (20) | 0.350 to 0.771, plus one at 1.432 (face-api had one outlier on this set too) |
| Different person, next portrait (20) | 1.187 to 1.625 |
| Walt's six stills against his front and three-quarter views | 0.309 to 0.624 |

`DISTANCE_PERFECT = 0.60` and `DISTANCE_ZERO = 1.45` put 80 at 0.77 and 60 at 0.94, so the Check band sits in
the gap, as in the app: 19 of 20 same-person pairs score 80 or more, every different-person pair is under 32.

**In ComfyUI** (current `master`, torch 2.14 CPU, in a scratch venv): the pack loads, and a graph ran end to end.
The prompt came out in the app's form, the reference batch had two frames, and the views had four. Walt's diner
still scored 100, and the diner and pier stills as a batch scored a median of 98.5 (worst 97). The weights
downloaded and passed their hash. A locked copy of Walt and a scene naming `{second}` were refused with plain
messages. `OBJECT_INFO_URL=http://127.0.0.1:8188/object_info npm run workflows:check` passed for the pack's
example graph and both M8 workflows, and ComfyUI lists the example under the pack's templates. The example wasn't
opened in ComfyUI's frontend: Chrome here showed an error page for the local server that curl reached fine.
Partner nodes weren't run, since they need a signed-in Comfy account.

**Publishing:** `pyproject.toml` has the Registry fields (name `portraius-characters`, `PublisherId = "marzuwqlion"`,
which must match the publisher Marzuwq creates). `.github/workflows/publish-node-pack.yml` runs the Registry
action's steps from the pack's folder, by hand only, and stops without the `REGISTRY_ACCESS_TOKEN` secret.

## Production check: HappyHorse's host

A probe of HappyHorse 1.0 (Recast's Object Swap engine since M4; request `2c9cabcd-0cc9-44fa-b8f8-83edb05938f8`)
showed its results come from `dashscope-463f.oss-accelerate.aliyuncs.com`, with `Access-Control-Allow-Origin: *`.
The site's CSP didn't list it, so on GitHub Pages Object Swap and setting changes couldn't save their results. The
dev server sets no CSP, which is why no test hit it. `*.oss-accelerate.aliyuncs.com` is in the CSP now.

## Follow-ups

- Publish the node pack: create the publisher on registry.comfy.org (ID `marzuwqlion`, or change `PublisherId`), save
  its key as `REGISTRY_ACCESS_TOKEN`, run "Publish node pack".
- Open the pack's example workflow in a ComfyUI frontend once, and run it signed in.
- The Tour has no voice, lip sync or one-take samples yet; they'd come with the sample character.
- Still open from M8: the grease mark's contrast on Studio grey.
