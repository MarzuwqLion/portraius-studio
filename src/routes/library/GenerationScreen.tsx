import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { Screen } from "@/components/shell/Screen";
import { RealismAction, RealismStatus, RealismTake } from "@/components/studio/Realism";
import { RemixActions } from "@/components/studio/RemixActions";
import { SaveAsElement } from "@/components/studio/SaveAsElement";
import { SocialExport } from "@/components/studio/SocialExport";
import { SpeakAction } from "@/components/studio/Speak";
import { ScoreBadge } from "@/components/studio/Take";
import { Button } from "@/components/ui/button";
import { useJob } from "@/lib/jobs/hooks";
import { deleteGeneration, generationFiles, saveFile } from "@/lib/library/library";
import { modelLabel } from "@/lib/registry/models";
import { db } from "@/lib/store/db";
import { useBlobUrl, useGeneration } from "@/lib/store/hooks";

export function GenerationScreen() {
  const { generationId } = useParams();
  const navigate = useNavigate();
  const generation = useGeneration(generationId);
  const missing = useLiveQuery(async () => (generationId ? !(await db.generations.get(generationId)) : true), [generationId]);
  const names = useLiveQuery(async () => (generation ? (await db.characters.bulkGet(generation.characterIds)).map((c, i) => ({ id: generation.characterIds[i]!, name: c?.name })) : []), [generation?.id]);
  const image = generation?.assets.find((a) => a.kind === "image");
  const video = generation?.assets.find((a) => a.kind === "video");
  const frame = generation?.assets.find((a) => a.kind === "frame");
  const imageUrl = useBlobUrl(image?.blobId);
  const videoUrl = useBlobUrl(video?.blobId);
  const posterUrl = useBlobUrl(frame?.blobId);
  const [confirming, setConfirming] = useState(false);
  const job = useJob(generation?.jobId);
  const realism = job?.kind === "enhance" ? job : undefined;
  const [startedRealism, setStartedRealism] = useState<string>();

  if (missing) {
    return (
      <Screen title="Take">
        <p className="text-body">
          This take isn't in your library.{" "}
          <Link to="/library" className="font-semibold underline underline-offset-4">
            Back to the library
          </Link>
        </p>
      </Screen>
    );
  }
  if (!generation) return <Screen title="Take" />;

  async function download() {
    for (const file of await generationFiles(generation!)) saveFile(file.blob, file.name);
  }

  return (
    <Screen title={generation.type === "scene" ? "Scene" : generation.type === "image" ? "Take" : "Clip"}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex items-center justify-center rounded-media bg-seamless p-6">
          {realism ? (
            <div className="w-full max-w-3xl">
              <RealismTake job={realism} linkToLibrary={false} />
            </div>
          ) : videoUrl ? (
            <video src={videoUrl} poster={posterUrl} controls loop playsInline className="develop max-h-[70vh] max-w-full rounded-media border border-rule" aria-label={generation.prompt || "Clip"} />
          ) : imageUrl ? (
            <img src={imageUrl} alt={generation.prompt || "Image"} className="develop max-h-[70vh] max-w-full rounded-media border border-rule" />
          ) : null}
        </div>
        <aside className="grid content-start gap-4">
          {generation.scoreNote === "stylised" ? (
            <p className="text-control text-ink-muted">Score not available for stylised looks</p>
          ) : generation.identityScore !== undefined ? (
            <div className="flex flex-wrap items-baseline gap-3">
              <ScoreBadge score={generation.identityScore} />
              {generation.worstScore !== undefined && <span className="text-control text-ink-muted">worst frame {generation.worstScore}</span>}
            </div>
          ) : null}
          {generation.prompt && <p className="max-w-[70ch] text-body">{generation.prompt}</p>}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-control">
            <dt className="text-ink-muted">Model</dt>
            <dd>{modelLabel(generation.modelId)}</dd>
            <dt className="text-ink-muted">Made</dt>
            <dd>{new Date(generation.createdAt).toLocaleString()}</dd>
            {names && names.length > 0 && (
              <>
                <dt className="text-ink-muted">Cast</dt>
                <dd>
                  {names.map((c, i) => (
                    <span key={c.id}>
                      {i > 0 && ", "}
                      {c.name ? (
                        <Link to={`/characters/${c.id}`} className="underline underline-offset-4">
                          {c.name}
                        </Link>
                      ) : (
                        "Deleted character"
                      )}
                    </span>
                  ))}
                </dd>
              </>
            )}
            {generation.remixOf && (
              <>
                <dt className="text-ink-muted">Remix</dt>
                <dd>From a shared recipe ({generation.remixOf.slice(0, 8)})</dd>
              </>
            )}
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void download()}>
              Download
            </Button>
            {image && (
              <Button variant="secondary" onClick={() => navigate(`/video?from=${generation.id}`)}>
                Animate
              </Button>
            )}
            {image && <SaveAsElement generationId={generation.id} size="default" />}
          </div>
          {image && !realism && <RealismAction generationId={generation.id} onStarted={(j) => setStartedRealism(j.id)} />}
          {startedRealism && <RealismStatus jobId={startedRealism} />}
          {video && <SocialExport generationId={generation.id} />}
          {video && generation.type !== "scene" && <SpeakAction generationId={generation.id} />}
          <RemixActions generationId={generation.id} />
          {confirming ? (
            <div className="grid gap-2">
              <p className="text-body">Delete this take from the library? Download it first if you want to keep it.</p>
              <div className="flex gap-2">
                <Button variant="danger" onClick={() => void deleteGeneration(generation.id).then(() => navigate("/library", { replace: true }))}>
                  Delete take
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  Keep it
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" className="justify-self-start" onClick={() => setConfirming(true)}>
              Delete take
            </Button>
          )}
        </aside>
      </div>
    </Screen>
  );
}
