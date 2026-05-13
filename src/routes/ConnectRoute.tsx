import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useConnection } from "@/lib/connection/context";
import { ConnectHero } from "@/components/connect/ConnectHero";
import { ConnectForm } from "@/components/connect/ConnectForm";

export function ConnectRoute() {
  const { connection } = useConnection();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    if (connection) {
      const next = params.get("next");
      navigate(next ?? "/dashboard", { replace: true });
    }
  }, [connection, navigate, params]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg">
      {/* decorative grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(rgb(245 245 241 / 1) 1px, transparent 1px), linear-gradient(90deg, rgb(245 245 241 / 1) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-20 h-[40rem] w-[40rem] rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgb(182 255 60 / 0.18), rgb(182 255 60 / 0) 70%)",
        }}
      />

      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl gap-12 px-6 py-12 md:grid-cols-[1.2fr_1fr] md:items-center md:gap-16 md:py-20">
        <div className="flex flex-col justify-between gap-8">
          <header className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-accent" aria-hidden />
            <span className="font-display text-xl tracking-tight">suparbase</span>
          </header>
          <ConnectHero />
          <div className="hidden md:block">
            <FeatureBullets />
          </div>
        </div>
        <div className="self-center">
          <ConnectForm />
          <div className="mt-6 md:hidden">
            <FeatureBullets />
          </div>
        </div>
      </div>

      <footer className="relative mx-auto max-w-6xl px-6 pb-8 text-xs text-fg-faint">
        <div className="flex flex-wrap items-center justify-between gap-2 border-t hairline pt-4">
          <span>© 2026 Suparbase · client-only · BYO Supabase</span>
          <span className="font-mono">v0.1</span>
        </div>
      </footer>
    </div>
  );
}

function FeatureBullets() {
  const items = [
    { k: "01", title: "Schema introspection", body: "We read your project's OpenAPI document and infer types, primary keys, foreign keys, and enums." },
    { k: "02", title: "Smart forms", body: "Each field renders an input matched to its column type. Booleans become switches, JSON gets an editor, FKs get a searchable picker." },
    { k: "03", title: "Safe writes", body: "Confirmation on delete, 5-second undo, optimistic updates with rollback on error." },
  ];
  return (
    <ul className="space-y-3 text-sm">
      {items.map((it) => (
        <li key={it.k} className="flex gap-3 rounded border hairline bg-bg-raised/40 p-3">
          <span className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-accent">{it.k}</span>
          <div className="space-y-0.5">
            <p className="text-fg">{it.title}</p>
            <p className="text-fg-muted">{it.body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
