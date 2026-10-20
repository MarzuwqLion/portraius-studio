// Cost before every run (spec: Rules for every call, 4): the price when
// /estimate gives one, the range when it's estimated, else "price unknown".
import { requestBody } from "@/lib/registry/adapters";
import { estimate } from "@/lib/router/client";
import type { JobEstimate } from "@/lib/types/jobs";

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function estimateLabel(e: JobEstimate | undefined): string {
  if (e?.source === "exact" && e.amountCents !== undefined) return dollars(e.amountCents);
  if (e?.source === "estimated" && e.minCents !== undefined && e.maxCents !== undefined) return `${dollars(e.minCents)} to ${dollars(e.maxCents)}`;
  return "price unknown";
}

// Never throws: a failed estimate is just an unknown price.
export async function estimateRun(modelId: string, input: unknown): Promise<JobEstimate> {
  try {
    const res = await estimate(modelId, requestBody(modelId, input));
    return res.estimate;
  } catch {
    return { source: "unknown" };
  }
}
