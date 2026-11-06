"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Loader2, X, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BTN_SIZE,
  BTN_VARIANT,
  linkClass,
  type ButtonSize,
  type ButtonVariant,
} from "@/lib/ui-classes";

export { linkClass } from "@/lib/ui-classes";

// ───────────────────────────────────────────────────────────────────────── Button
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        "disabled:opacity-50 disabled:pointer-events-none",
        BTN_VARIANT[variant],
        BTN_SIZE[size],
        className
      )}
    >
      {loading && <Loader2 size={16} className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}


// ─────────────────────────────────────────────────────────────────────────── Card
export function Card({ className, children, ...rest }: React.ComponentProps<"div">) {
  return (
    <div {...rest} className={cn("rounded-lg border border-line bg-card", className)}>{children}</div>
  );
}

// ─────────────────────────────────────────────────────────────────────────── Input
export const Input = ({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...rest}
    className={cn(
      "h-9 w-full rounded-lg border border-line bg-card px-3 text-sm text-foreground",
      "placeholder:text-muted-foreground placeholder:text-muted",
      "focus:outline-none focus:ring-2 focus:ring-jade-300 dark:focus:ring-jade-700",
      "disabled:opacity-60",
      className
    )}
  />
);

export const Textarea = ({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea
    {...rest}
    className={cn(
      "w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-foreground",
      "placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-jade-300 dark:focus:ring-jade-700",
      className
    )}
  />
);

export const Select = ({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    {...rest}
    className={cn(
      "h-9 w-full rounded-lg border border-line bg-card px-2.5 text-sm text-foreground",
      "focus:outline-none focus:ring-2 focus:ring-jade-300 dark:focus:ring-jade-700",
      className
    )}
  >
    {children}
  </select>
);

export function Label({ children, className, htmlFor }: { children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("mb-1 block text-xs font-medium text-muted", className)}>{children}</label>
  );
}

// ─────────────────────────────────────────────────────────────────────────── Badge
export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "bg-jet-100 text-jet-700 border-jet-200 dark:bg-white/10 dark:text-jet-100 dark:border-white/10",
  info: "bg-munsell-50 text-munsell-800 border-munsell-200 dark:bg-munsell-900/40 dark:text-munsell-200 dark:border-munsell-800",
  success:
    "bg-jade-100 text-jade-900 border-jade-200 dark:bg-jade-900/40 dark:text-jade-200 dark:border-jade-800",
  warning:
    "bg-flax-100 text-flax-900 border-flax-200 dark:bg-flax-900/40 dark:text-flax-200 dark:border-flax-800",
  danger:
    "bg-dogwood-100 text-dogwood-900 border-dogwood-200 dark:bg-dogwood-900/40 dark:text-dogwood-200 dark:border-dogwood-800",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4",
        BADGE_TONE[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────────── Tabs
export interface TabItem {
  id: string;
  label: ReactNode;
}

export function Tabs({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn("inline-flex flex-wrap items-center gap-1 rounded-lg border border-line bg-subtle p-1", className)}
    >
      {items.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-jade-400",
            value === t.id
              ? "bg-card text-foreground border border-line"
              : "text-muted hover:text-foreground"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────── Modal
export function Modal({
  open,
  onClose,
  title,
  children,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-10"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn("mt-6 w-full rounded-lg border border-line bg-card", width)}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted hover:bg-subtle hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-jade-400"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────── Toast
export type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
}

const ToastCtx = createContext<{ push: (t: { kind: ToastKind; title: string; body?: string }) => void }>({
  push: () => {},
});

export function useToast() {
  return useContext(ToastCtx);
}

let toastSeq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const push = useCallback((t: { kind: ToastKind; title: string; body?: string }) => {
    const id = ++toastSeq;
    setItems((prev) => [...prev.slice(-4), { ...t, id }]);
    const timer = setTimeout(() => {
      setItems((prev) => prev.filter((x) => x.id !== id));
      timers.current.delete(id);
    }, 4500);
    timers.current.set(id, timer);
  }, []);

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex items-start gap-2 rounded-lg border border-line bg-card p-3 text-sm shadow-sm"
          >
            <span className="mt-0.5 shrink-0">
              {t.kind === "success" ? (
                <CheckCircle2 size={16} className="text-moss-600" />
              ) : t.kind === "error" ? (
                <AlertCircle size={16} className="text-dogwood-500" />
              ) : (
                <Info size={16} className="text-munsell-600" />
              )}
            </span>
            <div className="min-w-0">
              <p className="font-medium leading-5">{t.title}</p>
              {t.body && <p className="mt-0.5 text-xs text-muted">{t.body}</p>}
            </div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ───────────────────────────────────────────────────────────────────────── Toggle
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-jade-400 disabled:opacity-60"
    >
      <span>{label}</span>
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full border transition-colors",
          checked ? "border-jade-500 bg-accent" : "border-line bg-subtle"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all",
            checked ? "left-[18px] bg-jet-800 dark:bg-jet-950" : "left-0.5 bg-jet-400"
          )}
        />
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────── PageHeader
/** A heading is ONE bare line — never a paragraph under it. */
export function PageHeader({
  title,
  right,
}: {
  title: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────── EmptyState
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line bg-card px-6 py-14 text-center">
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs text-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────── Spinner
export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted">
      <Loader2 size={16} className="animate-spin" aria-hidden />
      {label ?? "Loading…"}
    </div>
  );
}
