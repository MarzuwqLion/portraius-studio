import { useCallback, useEffect, useRef, useState } from "react";
import { clearDraft, loadDraft, newDraft, saveDraft, type CreatePath, type WizardDraft } from "@/lib/characters/draft";

export type DraftPatch = Partial<WizardDraft> | ((draft: WizardDraft) => Partial<WizardDraft>);
export type UpdateDraft = (patch: DraftPatch) => void;

// The wizard's state, saved to IndexedDB on every change so a reload resumes it.
export function useDraft(path: CreatePath) {
  const [draft, setDraft] = useState<WizardDraft>();
  const latest = useRef<WizardDraft | undefined>(undefined);

  useEffect(() => {
    let live = true;
    void loadDraft(path).then((loaded) => {
      if (!live) return;
      latest.current = loaded ?? newDraft(path);
      setDraft(latest.current);
    });
    return () => {
      live = false;
    };
  }, [path]);

  const update = useCallback<UpdateDraft>((patch) => {
    const current = latest.current;
    if (!current) return;
    const next = { ...current, ...(typeof patch === "function" ? patch(current) : patch) };
    latest.current = next;
    setDraft(next);
    void saveDraft(next);
  }, []);

  const reset = useCallback(async () => {
    await clearDraft(path);
    latest.current = newDraft(path);
    setDraft(latest.current);
  }, [path]);

  return { draft, update, reset };
}
