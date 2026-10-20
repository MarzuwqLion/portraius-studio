import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { VOICES, voice } from "@/lib/presets/load";
import { Select } from "./fields";

const previewUrl = (file: string) => `${import.meta.env.BASE_URL}voices/${file}`;

// A stock voice (spec: Voice), with a button that plays its short preview.
export function VoicePicker({
  id,
  value,
  onChange,
  placeholder,
  label,
}: {
  id?: string;
  value: string | undefined;
  onChange: (voiceId: string | undefined) => void;
  placeholder?: string;
  label?: string; // when there's no <label> for the select
}) {
  const player = useRef<HTMLAudioElement | null>(null);
  const chosen = voice(value);
  useEffect(() => () => player.current?.pause(), []);
  function hear() {
    if (!chosen) return;
    player.current?.pause();
    player.current = new Audio(previewUrl(chosen.preview));
    void player.current.play().catch(() => undefined);
  }
  return (
    <div className="grid gap-1.5">
      <div className="flex gap-2">
        <Select
          id={id}
          value={value}
          onChange={onChange}
          {...(placeholder !== undefined ? { placeholder } : {})}
          {...(label ? { label } : {})}
          options={VOICES.map((v) => ({ value: v.id, label: `${v.label}: ${v.description}` }))}
        />
        <Button type="button" size="default" variant="secondary" disabled={!chosen} onClick={hear}>
          Hear it
        </Button>
      </div>
    </div>
  );
}
