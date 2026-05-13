import { Sparkles } from "lucide-react";
import { ConnectionForm } from "@/components/connections/ConnectionForm";
import { PageHeader } from "@/components/workspace/PageHeader";

export default function NewConnectionPage() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Connections", href: "/connections" },
          { label: "New" },
        ]}
        title="Connect a Supabase project"
        subtitle={
          <span className="text-sm text-fg-muted">
            Paste the project URL + API key from your Supabase dashboard.
            We encrypt the key with AES-256-GCM before the row is committed —
            it never reaches a browser after this form.
          </span>
        }
        eyebrow={
          <>
            <Sparkles className="h-3 w-3 text-accent" aria-hidden />
            Tip: find both at <span className="font-mono">supabase.com/dashboard → Project → Settings → API</span>
          </>
        }
      />
      <div className="surface rounded-md p-6">
        <ConnectionForm />
      </div>
    </div>
  );
}
