// The UI reads jobs through these hooks, built on Dexie liveQuery. This is the
// only React file in lib/jobs; the machine and runner stay framework-free.
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/store/db";
import type { Job } from "@/lib/types/jobs";

export function useJob(id: string | undefined): Job | undefined {
  return useLiveQuery(() => (id ? db.jobs.get(id) : undefined), [id]);
}

export function useRecentJobs(limit = 24): Job[] {
  return useLiveQuery(() => db.jobs.orderBy("createdAt").reverse().limit(limit).toArray(), [limit]) ?? [];
}
