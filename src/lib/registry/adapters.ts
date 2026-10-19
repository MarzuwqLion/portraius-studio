// Attaches each adapter to its registry model ID, so adapters never hold an ID.
// Director agent and identity judge return text, not assets, so they have none.
import { elevenLabs } from "@/lib/adapters/elevenlabs";
import { freepikSkin } from "@/lib/adapters/freepik-skin";
import { klingOmni } from "@/lib/adapters/kling-omni";
import { minimaxH3 } from "@/lib/adapters/minimax-h3";
import { nanoBanana } from "@/lib/adapters/nano-banana";
import { seedance } from "@/lib/adapters/seedance";
import { sync3 } from "@/lib/adapters/sync3";
import type { AdapterImpl, ModelAdapter } from "./capabilities";
import { MODEL_IDS, type RegistryModelId } from "./models";

// Inputs and results are typed inside each adapter; callers holding a stored
// job only have unknown values, so the map is erased to unknown.
type AnyAdapter = ModelAdapter<unknown, unknown>;

function attach<I, Raw>(id: RegistryModelId, impl: AdapterImpl<I, Raw>): AnyAdapter {
  return { id, ...impl } as unknown as AnyAdapter;
}

const ADAPTERS = new Map<string, AnyAdapter>(
  [
    attach(MODEL_IDS.nanoBanana, nanoBanana),
    attach(MODEL_IDS.seedance, seedance),
    attach(MODEL_IDS.minimaxH3, minimaxH3),
    attach(MODEL_IDS.klingOmni, klingOmni),
    attach(MODEL_IDS.freepikSkin, freepikSkin),
    attach(MODEL_IDS.elevenLabs, elevenLabs),
    attach(MODEL_IDS.sync3, sync3),
  ].map((adapter) => [adapter.id, adapter]),
);

export function adapterFor(modelId: string): AnyAdapter {
  const adapter = ADAPTERS.get(modelId);
  if (!adapter) throw new Error(`No adapter for ${modelId}`);
  return adapter;
}

export function allAdapters(): AnyAdapter[] {
  return [...ADAPTERS.values()];
}
