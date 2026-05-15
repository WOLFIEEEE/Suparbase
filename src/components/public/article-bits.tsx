import { AlertTriangle, Info, Lightbulb, Sparkles } from "lucide-react";
import { cn } from "@/lib/ui/cn";

/**
 * Code block, server component. We don't run syntax highlighting at the
 * runtime layer to keep articles SSR-fast; the inline styling below gives
 * code a calm, readable look without a 200KB shiki dependency.
 */
export function CodeBlock({
  children,
  language,
  filename,
}: {
  children: string;
  language?: string;
  filename?: string;
}) {
  return (
    <figure className="my-6 overflow-hidden rounded-lg border hairline bg-bg-sunken/80">
      {(language || filename) && (
        <figcaption className="flex items-center justify-between gap-2 border-b hairline bg-bg-raised/60 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-faint">
          <span>{filename ?? language}</span>
          {language && filename && <span className="text-fg-faint/70">{language}</span>}
        </figcaption>
      )}
      <pre className="overflow-x-auto px-4 py-3 text-[12px] leading-relaxed">
        <code className="font-mono text-fg">{children.trim()}</code>
      </pre>
    </figure>
  );
}

interface CalloutProps {
  variant?: "tip" | "watch-out" | "note" | "sparkle";
  title?: string;
  children: React.ReactNode;
}

export function Callout({ variant = "note", title, children }: CalloutProps) {
  const Icon =
    variant === "tip"
      ? Lightbulb
      : variant === "watch-out"
      ? AlertTriangle
      : variant === "sparkle"
      ? Sparkles
      : Info;
  return (
    <aside
      className={cn(
        "my-6 flex gap-3 rounded-md border px-4 py-3 text-sm",
        variant === "tip" && "border-accent/40 bg-accent/5",
        variant === "watch-out" && "border-danger/40 bg-danger/5",
        variant === "sparkle" && "border-accent/40 bg-accent/5",
        variant === "note" && "border-warn/40 bg-warn/5",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          variant === "tip" && "text-accent",
          variant === "watch-out" && "text-danger",
          variant === "sparkle" && "text-accent",
          variant === "note" && "text-warn",
        )}
        aria-hidden
      />
      <div className="min-w-0 space-y-1">
        {title && <p className="font-medium text-fg">{title}</p>}
        <div className="text-fg-muted">{children}</div>
      </div>
    </aside>
  );
}

/**
 * Marker so we can deep-link h2 sections without adding ids by hand.
 * Each H2 in an article should use this so the table of contents anchors
 * line up.
 */
export function ArticleH2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-24">
      <a
        href={`#${id}`}
        className="group inline-flex items-center gap-1.5 !no-underline"
      >
        <span>{children}</span>
        <span
          aria-hidden
          className="select-none text-fg-faint opacity-0 transition-opacity group-hover:opacity-100"
        >
          #
        </span>
      </a>
    </h2>
  );
}
