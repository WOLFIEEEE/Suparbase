import { cn } from "@/lib/ui/cn";

/**
 * Suparbase mark. Three offset bars forming a stylized 'S': top/bottom in
 * `currentColor`, the middle bar in the brand accent. The mark is
 * theme-aware: it inherits text color and uses CSS variable `--accent`.
 *
 * Use the bare <Logo /> when you only want the glyph (favicon, dropdown
 * avatar slots, sidebar collapsed state). Use <Wordmark /> for the full
 * "logo + suparbase" lockup used in headers.
 */
export function Logo({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("h-5 w-5", className)}
      {...props}
    >
      {/* top bar: currentColor */}
      <rect x="3" y="4" width="14" height="4" rx="1.5" fill="currentColor" />
      {/* middle bar: accent */}
      <rect x="7" y="10" width="14" height="4" rx="1.5" fill="rgb(var(--accent))" />
      {/* bottom bar: currentColor */}
      <rect x="3" y="16" width="14" height="4" rx="1.5" fill="currentColor" />
    </svg>
  );
}

const SIZE_TO_MARK: Record<NonNullable<WordmarkProps["size"]>, string> = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-7 w-7",
};

const SIZE_TO_TEXT: Record<NonNullable<WordmarkProps["size"]>, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl",
};

interface WordmarkProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  showText?: boolean;
}

export function Wordmark({ size = "md", className, showText = true }: WordmarkProps) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-fg", className)}>
      <Logo className={SIZE_TO_MARK[size]} />
      {showText && (
        <span className={cn("font-display tracking-tight leading-none", SIZE_TO_TEXT[size])}>
          suparbase
        </span>
      )}
    </span>
  );
}
