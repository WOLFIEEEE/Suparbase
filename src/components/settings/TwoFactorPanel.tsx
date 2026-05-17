"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Copy, Download, KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface Props {
  email: string;
  enabled: boolean;
  enabledAt: string | null;
  remainingRecoveryCodes: number;
  hasPassword: boolean;
}

type SetupState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; secret: string; otpauthUrl: string; qrSvgDataUrl: string }
  | { kind: "saving" }
  | { kind: "done"; recoveryCodes: string[] }
  | { kind: "error"; message: string };

/**
 * Two-factor authentication management panel. Mounts on
 * /settings/account/2fa. Three states:
 *
 *   - Disabled: "Enable" button. Click → GET /setup → show QR + code
 *     entry → POST /enable → show recovery codes (once) + download.
 *   - Enabled: status badge + "Disable" button gated behind the
 *     current password (so a hijacked session can't weaken auth).
 *   - OAuth-only: when there's no password hash, disable warns the
 *     user to email support.
 */
export function TwoFactorPanel({ email, enabled, enabledAt, remainingRecoveryCodes, hasPassword }: Props) {
  const router = useRouter();
  const [setup, setSetup] = useState<SetupState>({ kind: "idle" });
  const [code, setCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableConfirmOpen, setDisableConfirmOpen] = useState(false);

  async function startSetup() {
    setSetup({ kind: "loading" });
    try {
      const res = await fetch("/api/account/2fa/setup");
      const data = (await res.json()) as { secret?: string; otpauthUrl?: string; qrSvgDataUrl?: string };
      if (!res.ok || !data.secret || !data.qrSvgDataUrl) {
        setSetup({ kind: "error", message: "Could not generate a setup code." });
        return;
      }
      setSetup({
        kind: "ready",
        secret: data.secret,
        otpauthUrl: data.otpauthUrl ?? "",
        qrSvgDataUrl: data.qrSvgDataUrl,
      });
      setCode("");
    } catch (e) {
      setSetup({ kind: "error", message: (e as Error).message ?? "Network error." });
    }
  }

  async function confirmEnable() {
    if (setup.kind !== "ready") return;
    setSetup({ kind: "saving" });
    try {
      const res = await fetch("/api/account/2fa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: setup.secret, code }),
      });
      const data = (await res.json()) as { recoveryCodes?: string[]; message?: string };
      if (!res.ok || !data.recoveryCodes) {
        setSetup({ kind: "error", message: data.message ?? "Enable failed." });
        return;
      }
      setSetup({ kind: "done", recoveryCodes: data.recoveryCodes });
      toast.success("Two-factor authentication enabled.");
    } catch (e) {
      setSetup({ kind: "error", message: (e as Error).message ?? "Network error." });
    }
  }

  function copyCodes() {
    if (setup.kind !== "done") return;
    void navigator.clipboard.writeText(setup.recoveryCodes.join("\n"));
    toast.success("Recovery codes copied to clipboard.");
  }

  function downloadCodes() {
    if (setup.kind !== "done") return;
    const body =
      `Suparbase recovery codes\n` +
      `Account: ${email}\n` +
      `Generated: ${new Date().toISOString()}\n\n` +
      setup.recoveryCodes.join("\n") +
      `\n\nKeep these somewhere safe. Each code works once.\n`;
    const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `suparbase-recovery-codes-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function runDisable() {
    return new Promise<void>((resolve, reject) => {
      void (async () => {
        try {
          const res = await fetch("/api/account/2fa/disable", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: disablePassword }),
          });
          const data = (await res.json()) as { message?: string };
          if (!res.ok) {
            toast.error(data.message ?? "Disable failed.");
            reject(new Error(data.message ?? "Disable failed."));
            return;
          }
          toast.success("Two-factor authentication disabled.");
          setDisablePassword("");
          router.refresh();
          resolve();
        } catch (e) {
          toast.error((e as Error).message ?? "Network error.");
          reject(e);
        }
      })();
    });
  }

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <Link href="/settings/account" className="text-xs text-fg-muted hover:text-fg">
          ← Account
        </Link>
        <h1 className="font-display text-display-md">Two-factor authentication</h1>
        <p className="text-sm text-fg-muted">
          A time-based one-time password (TOTP) on top of your password. Works
          with any standard authenticator: 1Password, Bitwarden, Google
          Authenticator, Authy, etc.
        </p>
      </header>

      {enabled ? (
        <EnabledPanel
          email={email}
          enabledAt={enabledAt}
          remaining={remainingRecoveryCodes}
          hasPassword={hasPassword}
          disablePassword={disablePassword}
          setDisablePassword={setDisablePassword}
          openConfirm={() => setDisableConfirmOpen(true)}
        />
      ) : setup.kind === "idle" ? (
        <DisabledPanel onEnable={startSetup} />
      ) : setup.kind === "loading" ? (
        <div className="rounded-lg border hairline bg-bg-raised p-6 text-sm text-fg-muted">
          Generating your setup code…
        </div>
      ) : setup.kind === "ready" || setup.kind === "saving" ? (
        <SetupPanel
          email={email}
          qrSvgDataUrl={setup.kind === "ready" ? setup.qrSvgDataUrl : ""}
          secret={setup.kind === "ready" ? setup.secret : ""}
          code={code}
          setCode={setCode}
          saving={setup.kind === "saving"}
          onConfirm={confirmEnable}
          onCancel={() => setSetup({ kind: "idle" })}
        />
      ) : setup.kind === "done" ? (
        <RecoveryCodesPanel
          codes={setup.recoveryCodes}
          onCopy={copyCodes}
          onDownload={downloadCodes}
          onAck={() => {
            setSetup({ kind: "idle" });
            router.refresh();
          }}
        />
      ) : (
        <div className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {setup.message}{" "}
          <button onClick={() => setSetup({ kind: "idle" })} className="underline">
            Start over
          </button>
        </div>
      )}

      <ConfirmDialog
        open={disableConfirmOpen}
        onOpenChange={setDisableConfirmOpen}
        title="Disable two-factor authentication?"
        description="Removes the TOTP secret and all unused recovery codes. Your account will be protected by password only."
        confirmLabel="Disable 2FA"
        tone="danger"
        onConfirm={runDisable}
      />
    </div>
  );
}

function DisabledPanel({ onEnable }: { onEnable: () => void }) {
  return (
    <section className="space-y-4 rounded-lg border hairline bg-bg-raised p-5">
      <div className="space-y-1">
        <p className="text-[11px] uppercase tracking-[0.18em] text-fg-faint">Status</p>
        <p className="text-sm">
          <span className="text-fg-muted">Two-factor authentication is</span>{" "}
          <strong className="text-fg">off</strong>.
        </p>
      </div>
      <p className="text-xs text-fg-muted">
        Enable to require a 6-digit code from your authenticator app on every
        sign-in. We&apos;ll also give you 10 single-use recovery codes for the
        case where you lose the device.
      </p>
      <Button onClick={onEnable}>
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
        Enable 2FA
      </Button>
    </section>
  );
}

function SetupPanel({
  email,
  qrSvgDataUrl,
  secret,
  code,
  setCode,
  saving,
  onConfirm,
  onCancel,
}: {
  email: string;
  qrSvgDataUrl: string;
  secret: string;
  code: string;
  setCode: (s: string) => void;
  saving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="space-y-6 rounded-lg border hairline bg-bg-raised p-5">
      <ol className="space-y-5 text-sm">
        <li>
          <strong className="text-fg">1. Scan this QR with your authenticator app.</strong>
          <p className="mt-1 text-xs text-fg-muted">
            Adds an entry labelled <code className="font-mono">Suparbase ({email})</code>.
          </p>
          {qrSvgDataUrl && (
            <div className="mt-3 inline-block rounded-md border hairline bg-white p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrSvgDataUrl} alt="2FA setup QR code" width={192} height={192} />
            </div>
          )}
        </li>
        <li>
          <strong className="text-fg">2. Or paste this secret manually.</strong>
          <div className="mt-1 flex items-center gap-2">
            <code className="break-all rounded border hairline bg-bg px-3 py-2 font-mono text-xs">
              {secret}
            </code>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(secret);
                toast.success("Secret copied.");
              }}
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
              Copy
            </Button>
          </div>
        </li>
        <li>
          <strong className="text-fg">3. Enter the 6-digit code from the app.</strong>
          <div className="mt-2 max-w-xs space-y-1.5">
            <Label htmlFor="enable-code" className="text-[11px] uppercase tracking-[0.16em] text-fg-faint">
              Code
            </Label>
            <Input
              id="enable-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              className="font-mono"
            />
          </div>
        </li>
      </ol>

      <div className="flex gap-2">
        <Button onClick={onConfirm} disabled={saving || code.trim().length !== 6}>
          {saving ? "Enabling…" : "Verify and enable"}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </section>
  );
}

function RecoveryCodesPanel({
  codes,
  onCopy,
  onDownload,
  onAck,
}: {
  codes: string[];
  onCopy: () => void;
  onDownload: () => void;
  onAck: () => void;
}) {
  return (
    <section className="space-y-4 rounded-lg border border-accent/40 bg-accent/5 p-5">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        <div>
          <p className="font-medium text-fg">Recovery codes — save these now.</p>
          <p className="mt-1 text-xs text-fg-muted">
            Use one if you lose access to your authenticator app. Each code
            works exactly once. We won&apos;t show them again — copy or
            download before leaving this page.
          </p>
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-2 rounded-md border hairline bg-bg p-3 font-mono text-xs sm:grid-cols-5">
        {codes.map((c) => (
          <li key={c} className="rounded px-2 py-1 text-center">
            {c}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button onClick={onDownload}>
          <Download className="h-3.5 w-3.5" aria-hidden />
          Download .txt
        </Button>
        <Button variant="secondary" onClick={onCopy}>
          <Copy className="h-3.5 w-3.5" aria-hidden />
          Copy all
        </Button>
        <Button variant="ghost" onClick={onAck}>
          I&apos;ve saved them
        </Button>
      </div>
    </section>
  );
}

function EnabledPanel({
  enabledAt,
  remaining,
  hasPassword,
  disablePassword,
  setDisablePassword,
  openConfirm,
}: {
  email: string;
  enabledAt: string | null;
  remaining: number;
  hasPassword: boolean;
  disablePassword: string;
  setDisablePassword: (s: string) => void;
  openConfirm: () => void;
}) {
  const lowCodes = remaining <= 3;
  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-lg border border-accent/40 bg-accent/5 p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
          <div>
            <p className="font-medium text-fg">2FA is on.</p>
            <p className="mt-1 text-xs text-fg-muted">
              Enabled {enabledAt ? new Date(enabledAt).toLocaleDateString() : "—"}.
              Every sign-in requires a code from your authenticator (or one of
              your recovery codes).
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-md border hairline bg-bg p-3 text-xs">
          <KeyRound className="h-3.5 w-3.5 text-fg-faint" aria-hidden />
          <span className={lowCodes ? "text-amber-400" : "text-fg-muted"}>
            {remaining} recovery code{remaining === 1 ? "" : "s"} remaining
          </span>
          {lowCodes && (
            <span className="ml-auto text-fg-faint">
              Regenerate by disabling + re-enabling.
            </span>
          )}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-danger/40 bg-danger/5 p-5">
        <h2 className="font-display text-base text-danger">Disable 2FA</h2>
        {!hasPassword ? (
          <p className="text-xs text-fg-muted">
            This account signs in via OAuth, so password-based disable
            isn&apos;t available here. Reach out via{" "}
            <Link href="/contact?topic=support" className="text-accent hover:underline">
              our contact form
            </Link>{" "}
            to disable 2FA — we&apos;ll re-verify your identity through other
            means.
          </p>
        ) : (
          <>
            <p className="text-xs text-fg-muted">
              Re-enter your password to confirm. We require this so a hijacked
              session can&apos;t weaken your account.
            </p>
            <div className="max-w-xs space-y-1.5">
              <Label
                htmlFor="disable-password"
                className="text-[11px] uppercase tracking-[0.16em] text-fg-faint"
              >
                Current password
              </Label>
              <Input
                id="disable-password"
                type="password"
                autoComplete="current-password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
              />
            </div>
            <Button
              variant="danger"
              disabled={disablePassword.length < 8}
              onClick={openConfirm}
            >
              Disable 2FA
            </Button>
          </>
        )}
      </section>
    </div>
  );
}
