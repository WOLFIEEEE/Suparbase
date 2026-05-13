"use client";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { AppError } from "@/lib/errors";

const TITLES: Record<AppError["category"], string> = {
  network: "Can't reach the server",
  unauthorized: "Not signed in",
  forbidden: "Access denied",
  not_found: "Not found",
  constraint: "Constraint violation",
  rate_limited: "Rate-limited",
  server: "Server error",
  client_bug: "Something went wrong",
  validation: "Invalid request",
  no_key: "AI key missing",
};

const HINTS: Record<AppError["category"], string> = {
  network: "Check your network connection and try again.",
  unauthorized: "Your session may have expired. Sign in again.",
  forbidden: "The key cannot access this resource — likely an RLS policy.",
  not_found: "The resource doesn't exist.",
  constraint: "The database rejected this value. See details above.",
  rate_limited: "Wait a moment and try again.",
  server: "Try again in a moment.",
  client_bug: "We logged the issue. Try again.",
  validation: "Check the request and try again.",
  no_key: "Add an OpenRouter API key in Settings → AI.",
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
