# Portraius Studio: working rules

- docs/SPEC.md is the source of truth. Read the sections named in each milestone before coding.
  Paths the spec writes as lib/... live in src/lib/...
- The Contracts section is fixed: routes, module boundaries, job state machine, Dexie schema,
  error mapping, config. Change any of them only after asking Marzuwq.
- Static site for GitHub Pages: Vite + React + TypeScript with HashRouter. No backend.
  Only proxy/ (if M1 adds it) runs server-side.
- All generation goes through src/lib/router/client.ts. No other file imports @comfyorg/sdk.
- Model IDs live only in src/lib/registry/models.ts. Never add a higgsfield/* ID. Never send model_provider.
- Nano Banana means vertexai/gemini-nano-banana-2.1. Never vertexai/gemini-3.1-flash-image.
- Video: Seedance 2.5 is the default. MiniMax H3 is selectable, never the default.
- Queue every model that supports it. Sync only for byte-returning models, with fallback_provider=false.
- Download every asset on completion. Never persist a provider URL as the asset.
- Only src/lib/jobs/machine.ts changes a job's status.
- Never edit a Dexie version that has shipped; add version(n + 1) with upgrade().
- The Comfy API key comes only from the visitor via Settings. Never commit a key, never put one in a
  VITE_ variable, never log it, never add analytics or third-party scripts.
- Style only with the tokens in src/styles/tokens.css and follow Visual direction.
  No raw hex values, no shadcn component left in its default styling.
- When a check in "Unknowns and fallbacks" fails, apply that row's fallback and note it in
  docs/notes/. Stop only where the row says STOP AND ASK.
- Use designed characters for tests and thumbnails until Marzuwq provides the sample character.
- Before calling a task done: npm run typecheck && npm test.
  Run npm run smoke (key from the shell's COMFY_API_KEY) before any deploy.
- Small commits, one feature each. Write findings to docs/notes/ when a milestone asks.
- When a milestone says STOP AND ASK, stop and wait for Marzuwq's answer.
