import Link from "next/link";
import { cn } from "@/lib/ui/cn";

const REPO_URL = "https://github.com/WOLFIEEEE/Suparbase";

interface Props {
  /**
   * `wide` constrains content to `max-w-7xl` (workspace pages).
   * `narrow` constrains to `max-w-6xl` (account pages).
   * `bare` applies no max-width: caller controls layout.
   */
  width?: "wide" | "narrow" | "bare";
  className?: string;
}

export function AppFooter({ width = "narrow", className }: Props) {
  const inner =
    width === "wide"
      ? "max-w-7xl"
      : width === "narrow"
      ? "max-w-6xl"
      : "";
  return (
    <footer
      className={cn(
        "mt-12 border-t hairline",
        className,
      )}
    >
      <div
        className={cn(
          "mx-auto flex w-full flex-wrap items-center justify-between gap-2 px-6 py-4 text-[11px] text-fg-faint",
          inner,
        )}
      >
        <span>
          © {new Date().getFullYear()} Suparbase · client + server, encrypted at rest
        </span>
        <div className="flex items-center gap-3">
          <Link
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-fg"
          >
            github
          </Link>
          <span className="font-mono">v1.0</span>
        </div>
      </div>
    </footer>
  );
}
