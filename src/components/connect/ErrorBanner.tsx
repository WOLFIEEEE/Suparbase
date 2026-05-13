import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { AppError } from "@/lib/api/errors";

const TITLES: Record<AppError["category"], string> = {
  network: "Can't reach Supabase",
  unauthorized: "Key rejected",
  forbidden: "Access denied",
  not_found: "Endpoint not found",
  constraint: "Constraint violation",
  rate_limited: "Rate-limited",
  server: "Supabase responded with an error",
  client_bug: "Something went wrong",
};

const HINTS: Record<AppError["category"], string> = {
  network: "Check the URL and your network connection.",
  unauthorized: "Double-check the API key from your project's API settings.",
  forbidden: "The key cannot access this resource — likely an RLS policy.",
  not_found: "Is this URL pointing at a Supabase project?",
  constraint: "The database rejected this value. See details above.",
  rate_limited: "Wait a moment and try again.",
  server: "Try again in a moment.",
  client_bug: "We logged the issue. Try again.",
};

export function ErrorBanner({ error }: { error: AppError }) {
  return (
    <Alert tone="danger" className="flex gap-3">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="space-y-1">
        <AlertTitle>{TITLES[error.category]}</AlertTitle>
        <AlertDescription>
          <div className="font-mono text-xs opacity-90">{error.message}</div>
          <div className="mt-1 text-xs opacity-70">{HINTS[error.category]}</div>
        </AlertDescription>
      </div>
    </Alert>
  );
}
