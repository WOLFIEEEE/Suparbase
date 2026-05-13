import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ConnectionForm } from "@/components/connections/ConnectionForm";

export default function NewConnectionPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12">
      <Link href="/connections" className="inline-flex items-center gap-1 text-xs text-fg-faint hover:text-fg">
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> connections
      </Link>
      <h1 className="mt-2 mb-6 font-display text-display-md">New connection</h1>
      <div className="surface rounded p-6">
        <ConnectionForm />
      </div>
    </div>
  );
}
