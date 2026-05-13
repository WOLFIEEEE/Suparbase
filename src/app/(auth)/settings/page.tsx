import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

export default function SettingsIndexPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-display-md">Account settings</h1>
        <p className="text-sm text-fg-muted">Configure things that span every connection.</p>
      </header>

      <ul className="space-y-3">
        <li>
          <Link
            href="/settings/ai"
            className="group flex items-center justify-between gap-3 rounded border hairline bg-bg-raised p-4 transition-colors hover:border-line-strong"
          >
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-4 w-4 text-accent" aria-hidden />
              <div className="space-y-1">
                <h2 className="font-medium">AI assistance</h2>
                <p className="text-sm text-fg-muted">
                  Add your OpenRouter API key. Suparbase will classify each
                  table and route it to a purpose-built admin preset.
                </p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-fg-faint transition-colors group-hover:text-accent" aria-hidden />
          </Link>
        </li>
      </ul>
    </div>
  );
}
