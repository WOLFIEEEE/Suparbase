import { Sparkles } from "lucide-react";
import { ConnectionForm } from "@/components/connections/ConnectionForm";
import { ConnectionGuide } from "@/components/connections/ConnectionGuide";
import { PageHeader } from "@/components/workspace/PageHeader";

export default function NewConnectionPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <PageHeader
        breadcrumbs={[
          { label: "Connections", href: "/connections" },
          { label: "New" },
        ]}
        title="Connect a Supabase project"
        subtitle={
          <span className="text-sm text-fg-muted">
            Follow the steps to paste your project URL and API key. We encrypt the
            key with AES-256-GCM before the row is committed, and it never reaches a
            browser after this form.
          </span>
        }
        eyebrow={
          <>
            <Sparkles className="h-3 w-3 text-accent" aria-hidden />
            Takes about a minute
          </>
        }
      />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] lg:gap-12">
        <ConnectionGuide />
        <div className="surface h-fit rounded-md p-6 lg:sticky lg:top-6">
          <ConnectionForm />
        </div>
      </div>
    </div>
  );
}
