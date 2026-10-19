// Images the user brings into a studio (an edit source, a first frame): prepped
// in the browser and kept in the blobs table, referenced by ID from requests.
import { prepareImage } from "@/lib/media/image-prep";
import { db } from "@/lib/store/db";

export async function storeUpload(file: Blob): Promise<string> {
  const { blob } = await prepareImage(file);
  const id = `upload:${crypto.randomUUID()}`;
  await db.blobs.put({ id, blob, mime: blob.type, bytes: blob.size });
  return id;
}

// The first image of a finished generation, for "Edit again" and "Animate".
export async function generationImageBlobId(generationId: string): Promise<string | undefined> {
  const generation = await db.generations.get(generationId);
  return generation?.assets.find((a) => a.kind === "image")?.blobId;
}
