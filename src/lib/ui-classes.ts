import { cn } from "@/lib/utils";

/**
 * Server-safe button styling helpers. Plain module (no "use client") — server
 * components call `linkClass` while rendering `<Link>` buttons during SSR.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-[var(--accent-ink)] border border-transparent hover:bg-[var(--accent-strong)] focus-visible:ring-jade-500/60",
  secondary:
    "bg-card text-foreground border border-line hover:bg-pastel-100 dark:hover:bg-white/5 focus-visible:ring-jade-500/50",
  ghost:
    "bg-transparent text-foreground border border-transparent hover:bg-subtle focus-visible:ring-jade-500/50",
  danger:
    "bg-dogwood-200 text-jet-900 border border-dogwood-300 hover:bg-dogwood-300 dark:bg-dogwood-900/50 dark:text-dogwood-100 dark:hover:bg-dogwood-800 focus-visible:ring-dogwood-400/60",
};

export const BTN_SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5 text-xs gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
  lg: "h-11 px-5 text-[15px] gap-2",
};

/** Class string for <Link>-rendered buttons (same look as Button). */
export function linkClass(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  return cn(
    "inline-flex items-center justify-center rounded-lg font-medium transition-colors",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
    "disabled:opacity-50 disabled:pointer-events-none",
    BTN_VARIANT[variant],
    BTN_SIZE[size]
  );
}
