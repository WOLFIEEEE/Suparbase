"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Loader2,
  Send,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/ui/cn";

interface Props {
  /** Pre-fill default — the signed-in admin's email. */
  adminEmail: string;
  /** Current config snapshot for the static panel. */
  config: {
    configured: boolean;
    reason: string | null;
    from: string | null;
    replyTo: string | null;
  };
}

type SendResult = {
  ok: boolean;
  id?: string | null;
  reason?: string;
  error?: string;
  configured?: boolean;
  from?: string | null;
  replyTo?: string | null;
  to?: string;
  elapsedMs?: number;
};

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "result"; result: SendResult };

export function EmailDiagnostic({ adminEmail, config }: Props) {
  const [to, setTo] = useState(adminEmail);
  const [state, setState] = useState<State>({ kind: "idle" });

  async function send() {
    if (state.kind === "sending") return;
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/admin/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: to.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as SendResult;
      setState({ kind: "result", result: data });
    } catch (err) {
      setState({
        kind: "result",
        result: {
          ok: false,
          reason: "network",
          error: (err as Error).message ?? "Network error.",
        },
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* Static config snapshot */}
      <section className="rounded-lg border hairline bg-bg-raised/40 p-5">
        <h2 className="font-display text-base">Current configuration</h2>
        <p className="mt-1 text-xs text-fg-muted">
          Values resolved from env at render time. Restart the server after
          changing them in <code>.env.local</code> or Coolify.
        </p>
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[8rem_1fr] text-sm">
          <dt className="text-fg-muted">Status</dt>
          <dd>
            {config.configured ? (
              <Tag tone="ok">Configured</Tag>
            ) : (
              <Tag tone="warn">Not configured ({config.reason ?? "unknown"})</Tag>
            )}
          </dd>
          <dt className="text-fg-muted">EMAIL_FROM</dt>
          <dd className="font-mono text-xs">
            {config.from ? config.from : <span className="text-fg-faint">(unset)</span>}
          </dd>
          <dt className="text-fg-muted">EMAIL_REPLY_TO</dt>
          <dd className="font-mono text-xs">
            {config.replyTo ? (
              config.replyTo
            ) : (
              <span className="text-fg-faint">(unset, replies go to EMAIL_FROM)</span>
            )}
          </dd>
        </dl>
      </section>

      {/* Send-test form */}
      <section className="space-y-4 rounded-lg border hairline p-5">
        <div>
          <h2 className="font-display text-base">Send a test email</h2>
          <p className="mt-1 text-xs text-fg-muted">
            Fires a real send through Resend and surfaces the response. Use
            this whenever you change env vars, rotate the key, or verify a
            new domain. Counts against your Resend free-tier daily quota.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="test-to">Send to</Label>
          <Input
            id="test-to"
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            disabled={state.kind === "sending"}
            placeholder="you@yourdomain.com"
            maxLength={254}
          />
          <p className="text-[11px] text-fg-faint">
            Defaults to your admin email. Override to test deliverability to a
            specific address (Gmail, work inbox, etc.).
          </p>
        </div>

        <Button
          onClick={send}
          disabled={state.kind === "sending" || !to.trim()}
          aria-busy={state.kind === "sending"}
        >
          {state.kind === "sending" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Sending…
            </>
          ) : (
            <>
              <Send className="h-4 w-4" aria-hidden />
              Send test email
            </>
          )}
        </Button>

        {state.kind === "result" && <ResultPanel result={state.result} />}
      </section>

      {/* Cheat sheet for common failures */}
      <section className="rounded-lg border hairline bg-bg-raised/40 p-5 text-sm">
        <h2 className="font-display text-base">If it fails</h2>
        <ul className="mt-3 space-y-2 text-xs text-fg-muted">
          <li>
            <strong className="text-fg">no_key:</strong> set{" "}
            <code>RESEND_API_KEY</code> in <code>.env.local</code> (or Coolify),
            then restart.
          </li>
          <li>
            <strong className="text-fg">no_from:</strong> set{" "}
            <code>EMAIL_FROM</code> to a verified sender like{" "}
            <code>Suparbase &lt;invites@yourdomain.com&gt;</code>.
          </li>
          <li>
            <strong className="text-fg">failed (403 / domain_not_verified):</strong>{" "}
            add the domain on{" "}
            <a
              href="https://resend.com/domains"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              resend.com/domains
            </a>{" "}
            and publish the SPF + DKIM records they show.
          </li>
          <li>
            <strong className="text-fg">failed (validation_error):</strong> the{" "}
            <code>to</code> address is malformed, or your Resend account is in
            sandbox mode (only the signup email can receive until a domain is
            verified).
          </li>
          <li>
            <strong className="text-fg">200, but no email arrives:</strong>{" "}
            check spam first, then the{" "}
            <a
              href="https://resend.com/emails"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              Resend dashboard
            </a>{" "}
            for delivery / bounce status.
          </li>
        </ul>
      </section>
    </div>
  );
}

function ResultPanel({ result }: { result: SendResult }) {
  const success = result.ok;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "space-y-3 rounded-md border px-4 py-3 text-sm",
        success
          ? "border-accent/40 bg-accent/10"
          : "border-danger/40 bg-danger/10",
      )}
    >
      <div className="flex items-start gap-2">
        {success ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        ) : result.reason === "no_key" || result.reason === "no_from" ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
        ) : (
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {success
              ? "Resend accepted the send."
              : result.reason === "no_key" || result.reason === "no_from"
              ? "Email is not configured."
              : "Resend rejected the send."}
          </p>
          {result.error && (
            <p className="mt-1 break-words text-xs text-fg-muted">
              {result.error}
            </p>
          )}
        </div>
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-[11px] sm:grid-cols-[6rem_1fr]">
        {result.to && (
          <>
            <dt className="text-fg-faint">to</dt>
            <dd className="font-mono">{result.to}</dd>
          </>
        )}
        {result.from && (
          <>
            <dt className="text-fg-faint">from</dt>
            <dd className="font-mono">{result.from}</dd>
          </>
        )}
        {result.id && (
          <>
            <dt className="text-fg-faint">message id</dt>
            <dd className="flex items-center gap-2 font-mono">
              <span className="truncate">{result.id}</span>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(result.id ?? "")}
                className="rounded p-1 text-fg-faint hover:bg-bg-raised hover:text-fg"
                aria-label="Copy message id"
              >
                <Copy className="h-3 w-3" aria-hidden />
              </button>
            </dd>
          </>
        )}
        {result.reason && !success && (
          <>
            <dt className="text-fg-faint">reason</dt>
            <dd className="font-mono">{result.reason}</dd>
          </>
        )}
        {typeof result.elapsedMs === "number" && (
          <>
            <dt className="text-fg-faint">elapsed</dt>
            <dd className="font-mono">{result.elapsedMs}ms</dd>
          </>
        )}
      </dl>
    </div>
  );
}

function Tag({
  tone,
  children,
}: {
  tone: "ok" | "warn";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone === "ok"
          ? "bg-accent/15 text-accent"
          : "bg-warn/15 text-warn-fg dark:text-warn",
      )}
    >
      {children}
    </span>
  );
}
