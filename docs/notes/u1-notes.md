# U1 notes: every screen

## Prices (decision 2)

Router's `/estimate` hasn't returned a price for this key on any model since M1, so every button
said "price unknown". Now `src/lib/jobs/estimate.ts` asks `/estimate` first and, when it gives
nothing (no key yet, `not_enabled`, or an unknown price), falls back to a static table built only
from Comfy's published rates. A static price shows as "≈ $0.24"; Router's own exact price, when it
comes, shows as "$0.24". A model without a published rate shows no price, and the Generate footer
says "Prices aren't available for this key; Comfy bills your account as usual." Prices are always
dollars; "Spent this session" in Settings is now dollars too.

Rates were read on October 21, 2026.

| Model (Router ID) | Rate used | Source |
| --- | --- | --- |
| Credits to dollars | $1 = 211 credits | [How credits work in Comfy](https://support.comfy.org/articles/5846341390-how-credits-work-in-comfy): "$1 = 211 credits" |
| Nano Banana 2.1 (`vertexai/gemini-nano-banana-2.1`) | 0.4526 credits per 1K input tokens, 2.263 per 1K text output tokens (thinking included), 9.05 per 1K image output tokens | [Partner Nodes pricing](https://docs.comfy.org/tutorials/partner-nodes/pricing), Image: Nano Banana, row "Nano Banana 2.1" |
| Seedance 2.5 (`byteplus/dreamina-seedance-2-5-260628`) | 3.229 credits per 1K tokens at 480p and 720p, 3.530 at 1080p (no reference video); tokens = (input video s + output s) × width × height × fps ÷ 1024 | Partner Nodes pricing, Video: Seedance 2.5, and its formula note |
| MiniMax H3 (`minimax/minimax-h3`) | 27.16 credits per second at 768P, 39.22 at 2K; reference mode adds 12.07 per image over 5 | Partner Nodes pricing, MiniMax H3 Text to Video, First-Last-Frame to Video and Reference to Video rows |
| HappyHorse 1.0 video edit (`wan/happyhorse-1.0-video-edit`) | 29.54 credits per second of output at 720P (the app's setting); output length matches the input clip | Partner Nodes pricing, HappyHorse rows and the note "HappyHorse Video Edit supports HappyHorse 1.0 only. Billed at the same rates" |
| Kling V3 Omni (`kling/kling-v3-omni`) | Generation: 17.72 credits per second at 720p silent, 23.63 with audio; 23.63 and 29.54 at 1080p. A clip edit (not used since M4) has no price in the table | Partner Nodes pricing, `kling-v3-omni` rows |
| Freepik skin enhancer, faithful (`freepik/ai-skin-enhancer-faithful`) | 78.07 credits per run | Partner Nodes pricing, "Magnific Image Skin Enhancer (faithful)". Magnific is Freepik's upscaler brand, and this is the same faithful skin-enhancer endpoint; Comfy lists no row under the Freepik name |
| ElevenLabs v4 (`elevenlabs/eleven_v4`) | 24.14 credits per 1K characters | Partner Nodes pricing, ElevenLabs Text to Dialogue, `eleven_v4` |
| Director agent (`anthropic/claude-sonnet-5-5`) | 0.603 credits per 1K input tokens, 3.017 per 1K output | Partner Nodes pricing, Chat: Anthropic, "Sonnet 5.5, Sonnet 5" |
| Sync-3 (`synclabs/sync-3`) | None: no price shown | The table lists "sync.so Lip Sync ~40.13 / sec" without naming the model, and marks it approximate, so it isn't used for sync-3 |
| Wan 2.7 video edit, BFL video edit, Gemini 3.8 Flash | None: no price shown | A/B candidates and the P2 judge; the app doesn't run them from a button |

### What the table assumes

Two models bill by token, so the table needs token counts. Each one is either measured from the
app's own recorded runs or published:

- **Nano Banana image tokens:** 1,120 at 1K, 1,680 at 2K and 2,520 at 4K, Google's published
  output tokens per image for Nano Banana 2
  ([Vertex AI model page](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-1-flash-image)).
  The app's recorded 1K runs (`test/fixtures/nano-banana-2.1*.json`) billed exactly 1,120, and a
  test holds the table to that.
- **Nano Banana thinking:** about 1,000 tokens at Best (926 thought plus 42 text in the recorded
  HIGH run), none at Fast. Prompt text about 400 tokens. Reference images are left out of the
  screen's estimate: at about 1,120 input tokens each they add $0.002 per image.
- **Seedance frame size:** the 16:9 frame at each resolution (864×480, 1280×720, 1920×1080) at
  24 fps stands in for every ratio. The formula gives 38,880 tokens for the recorded 4 s 480p
  draft, which billed 38,830, and 194,400 for the 4 s 1080p final, which billed 196,425; a test
  holds both within 2%.
- **Director agent:** about 2,500 tokens in and 1,500 out per draft.

What a visitor sees, rounded to the cent:

| Run | Price |
| --- | --- |
| Image, 1K Fast | ≈ $0.05 |
| Image, 2K Best (the default) | ≈ $0.08 |
| Image, 4K Best | ≈ $0.12 |
| Video draft, Seedance 480p, 8 s | ≈ $1.19 |
| Seedance 1080p final, 8 s (from the draft) | ≈ $6.50 |
| Video, H3 768p, 5 s | ≈ $0.64 |
| Image, then animate on H3, 5 s (2K still plus clip) | ≈ $0.72 |
| Recast, Motion transfer on H3 768p, 8 s clip | ≈ $1.03 |
| Recast, Object swap on HappyHorse, 6 s clip | ≈ $0.84 |
| Make it real | ≈ $0.37 |

Two of these are more than the October 20 build implied. Seedance drafts at 480p cost about $0.15
a second, and a 1080p final about $0.81 a second. Nothing in the table changes how the app calls a
model; it only says what each call costs before it's made.
