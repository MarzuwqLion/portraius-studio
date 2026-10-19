// The UI reads jobs through these hooks, built on Dexie liveQuery. This is the
// only React file in lib/jobs; the machine and runner stay framework-free.
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/store/db";
import { useObjectUrl } from "@/lib/store/hooks";
import { estimateLabel, estimateRun } from "./estimate";
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

// The cost label for a run, fetched once per input. Building the input can be
// slow (photos to base64), so it's a function called inside the effect.
export function useEstimateLabel(modelId: string, buildInput: (() => Promise<unknown>) | undefined, key: string): string {
  const [label, setLabel] = useState("price unknown");
  useEffect(() => {
    if (!buildInput) return;
    let live = true;
    void buildInput()
      .then((input) => estimateRun(modelId, input))
      .then((e) => live && setLabel(estimateLabel(e)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // The key stands in for the input, which can be megabytes of base64.
  }, [modelId, key]);
  return label;
}

// Several jobs at once, in the order asked. undefined while loading.
export function useJobs(ids: readonly string[]): (Job | undefined)[] | undefined {
  return useLiveQuery(() => db.jobs.bulkGet([...ids]), [ids.join(",")]);
}
