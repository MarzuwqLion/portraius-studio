// The UI reads jobs through these hooks, built on Dexie liveQuery. This is the
// only React file in lib/jobs; the machine and runner stay framework-free.
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/store/db";
import { useObjectUrl } from "@/lib/store/hooks";
import { addEstimates, estimateLabel, estimateRun, type PriceHints } from "./estimate";
import type { Job } from "@/lib/types/jobs";

export function useJob(id: string | undefined): Job | undefined {
  return useLiveQuery(() => (id ? db.jobs.get(id) : undefined), [id]);
}

export function useRecentJobs(limit = 24): Job[] {
  return useLiveQuery(() => db.jobs.orderBy("createdAt").reverse().limit(limit).toArray(), [limit]) ?? [];
}

// A finished job's first image as an object URL, once it's saved.
export function useJobImageUrl(jobId: string | undefined): string | undefined {
  const blob = useLiveQuery(async () => {
    const job = jobId ? await db.jobs.get(jobId) : undefined;
    const generationId = job?.status === "done" ? job.generationIds[0] : undefined;
    const generation = generationId ? await db.generations.get(generationId) : undefined;
    const asset = generation?.assets.find((a) => a.kind === "image");
    return asset ? (await db.blobs.get(asset.blobId))?.blob : undefined;
  }, [jobId]);
  return useObjectUrl(blob);
}

// One model call in a run; a run can be several (a still, then its clip).
export interface PriceRequest {
  modelId: string;
  input: unknown;
  hints?: PriceHints;
}

// "known" carries a label; "unavailable" means no published price, which the
// Generate footer says in one line (spec: Decisions, October 21, item 2).
export interface Price {
  label?: string;
  state: "idle" | "loading" | "known" | "unavailable";
}

// The price of a run, fetched once per key. Building the input can be slow
// (photos to base64), so it's a function called inside the effect. times
// multiplies it (several takes at once).
export function usePrice(build: (() => Promise<PriceRequest[]>) | undefined, key: string, times = 1): Price {
  const [price, setPrice] = useState<Price>({ state: "idle" });
  useEffect(() => {
    if (!build) {
      setPrice({ state: "idle" });
      return;
    }
    let live = true;
    setPrice((p) => (p.state === "known" ? p : { state: "loading" }));
    void build()
      .then((requests) => Promise.all(requests.map((r) => estimateRun(r.modelId, r.input, r.hints))))
      .then((parts) => {
        const label = estimateLabel(addEstimates(parts, times));
        if (live) setPrice(label ? { label, state: "known" } : { state: "unavailable" });
      })
      .catch(() => live && setPrice({ state: "unavailable" }));
    return () => {
      live = false;
    };
    // The key stands in for the input, which can be megabytes of base64.
  }, [key, times, Boolean(build)]);
  return price;
}

// The price label for one model call, or undefined when there's none.
export function useEstimateLabel(modelId: string, buildInput: (() => Promise<unknown>) | undefined, key: string, hints?: PriceHints): string | undefined {
  return usePrice(buildInput ? async () => [{ modelId, input: await buildInput(), ...(hints ? { hints } : {}) }] : undefined, `${modelId}:${key}`).label;
}

// Several jobs at once, in the order asked. undefined while loading.
export function useJobs(ids: readonly string[]): (Job | undefined)[] | undefined {
  return useLiveQuery(() => db.jobs.bulkGet([...ids]), [ids.join(",")]);
}
