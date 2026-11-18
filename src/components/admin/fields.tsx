import type { FieldErrors } from "@/lib/validation";

type Common = { name: string; label: string; errors?: FieldErrors; hint?: string; required?: boolean };

export function Field({
  name, label, errors, hint, required, defaultValue, list, type = "text", maxLength, placeholder, inputMode,
}: Common & { defaultValue?: string | number | null; list?: string; type?: string; maxLength?: number; placeholder?: string; inputMode?: "decimal" | "numeric" | "tel" | "text" }) {
  const err = errors?.[name]?.[0];
  return (
    <div>
      <label htmlFor={`f-${name}`} className="label">{label}{required && <span className="text-accent"> *</span>}</label>
      <input
        id={`f-${name}`} name={name} type={type} defaultValue={defaultValue ?? ""} list={list} required={required}
        maxLength={maxLength} placeholder={placeholder} inputMode={inputMode} className="field"
        aria-invalid={Boolean(err)} aria-describedby={err ? `e-${name}` : hint ? `h-${name}` : undefined}
      />
      {hint && !err && <p id={`h-${name}`} className="hint">{hint}</p>}
      {err && <p id={`e-${name}`} className="error-text">{err}</p>}
    </div>
  );
}

export function Area({
  name, label, errors, hint, required, defaultValue, rows = 3, maxLength, placeholder,
}: Common & { defaultValue?: string | null; rows?: number; maxLength?: number; placeholder?: string }) {
  const err = errors?.[name]?.[0];
  return (
    <div>
      <label htmlFor={`f-${name}`} className="label">{label}{required && <span className="text-accent"> *</span>}</label>
      <textarea
        id={`f-${name}`} name={name} defaultValue={defaultValue ?? ""} rows={rows} required={required} maxLength={maxLength}
        placeholder={placeholder} className="field"
        aria-invalid={Boolean(err)} aria-describedby={err ? `e-${name}` : hint ? `h-${name}` : undefined}
      />
      {hint && !err && <p id={`h-${name}`} className="hint">{hint}</p>}
      {err && <p id={`e-${name}`} className="error-text">{err}</p>}
    </div>
  );
}

export function FormBanner({ state }: { state: { ok: boolean; message?: string } }) {
  if (!state.message) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={`rounded-md border px-3 py-2 text-sm ${state.ok ? "border-ok/40 bg-ok/10 text-ok" : "border-bad/40 bg-bad/10 text-bad"}`}
    >
      {state.message}
    </p>
  );
}
