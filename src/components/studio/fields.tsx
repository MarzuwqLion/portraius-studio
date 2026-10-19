import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Call-sheet controls, styled with the tokens. Native selects keep keyboard
// and screen-reader behaviour for free.

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={id} className="text-control font-semibold">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-control text-ink-muted">{hint}</p>}
    </div>
  );
}

export function Select<T extends string>({
  id,
  value,
  onChange,
  options,
  placeholder,
}: {
  id?: string;
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  options: readonly { value: T; label: string }[];
  placeholder?: string;
}) {
  return (
    <select
      id={id}
      value={value ?? ""}
      onChange={(e) => onChange((e.target.value || undefined) as T | undefined)}
      className="h-10 w-full rounded-control border border-rule bg-proof px-3 text-body text-ink"
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (value: T) => void; options: readonly { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1 rounded-control border border-rule p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("h-8 flex-1 rounded-[4px] px-3 text-control font-semibold whitespace-nowrap", value === o.value ? "bg-ink text-on-ink" : "text-ink hover:bg-tint-hover")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TextArea({ id, value, onChange, rows = 4, placeholder, maxLength }: { id?: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string; maxLength?: number }) {
  return (
    <textarea
      id={id}
      value={value}
      rows={rows}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-control border border-rule bg-proof p-3 text-body text-ink placeholder:text-ink-muted"
    />
  );
}
