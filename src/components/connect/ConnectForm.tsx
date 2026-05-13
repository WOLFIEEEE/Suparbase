import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { validateKey, validateUrl } from "@/lib/connection/validate";
import { decodeJwtRole, type KeyRole } from "@/lib/connection/jwt";
import { useConnection } from "@/lib/connection/context";
import { introspect } from "@/lib/schema/introspect";
import { AppError } from "@/lib/api/errors";
import { ServiceRoleWarning } from "./ServiceRoleWarning";
import { ErrorBanner } from "./ErrorBanner";

const ROLE_LABEL: Record<KeyRole, string> = {
  anon: "anon",
  authenticated: "user session",
  service_role: "service-role",
  unknown: "unknown role",
};

export function ConnectForm() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const { setConnection } = useConnection();

  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [remember, setRemember] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [pendingServiceRole, setPendingServiceRole] = useState(false);

  const urlValidation = validateUrl(url);
  const keyValidation = validateKey(key);
  const role: KeyRole | null = useMemo(() => (keyValidation.ok ? decodeJwtRole(keyValidation.key) : null), [keyValidation]);
  const canSubmit = urlValidation.ok && keyValidation.ok && !submitting;

  useEffect(() => {
    document.title = "Connect — Suparbase";
  }, []);

  async function performConnect() {
    if (!urlValidation.ok || !keyValidation.ok) return;
    setSubmitting(true);
    setError(null);
    const conn = {
      url: urlValidation.url,
      hostname: urlValidation.hostname,
      key: keyValidation.key,
      role: role ?? "unknown",
      connectedAt: Date.now(),
      remember,
    };
    try {
      // Eagerly introspect to verify the credentials work; cache result.
      const schema = await introspect(conn);
      qc.setQueryData(["schema", conn.hostname], schema);
      setConnection(conn);
      const next = params.get("next");
      navigate(next ?? "/dashboard", { replace: true });
    } catch (e) {
      if (e instanceof AppError) setError(e);
      else setError(new AppError("client_bug", "Unexpected error during connect."));
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    if (role === "service_role") {
      setPendingServiceRole(true);
      return;
    }
    void performConnect();
  }

  return (
    <div data-anim="form" className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-4 surface rounded p-6">
        <div className="space-y-2">
          <Label htmlFor="conn-url">Project URL</Label>
          <Input
            id="conn-url"
            placeholder="https://abcdefgh.supabase.co"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoComplete="url"
            autoFocus
            inputMode="url"
            aria-invalid={url.length > 0 && !urlValidation.ok}
            aria-describedby="conn-url-help"
          />
          <p id="conn-url-help" className="text-xs text-fg-faint">
            {url.length > 0 && !urlValidation.ok
              ? urlValidation.reason
              : "Find this in Project Settings → API"}
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="conn-key">API key</Label>
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              className="text-xs text-fg-muted hover:text-fg"
              aria-pressed={showKey}
            >
              {showKey ? (
                <span className="inline-flex items-center gap-1"><EyeOff className="h-3 w-3" /> hide</span>
              ) : (
                <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" /> show</span>
              )}
            </button>
          </div>
          <Input
            id="conn-key"
            type={showKey ? "text" : "password"}
            placeholder="eyJhbGciOi…"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={key.length > 0 && !keyValidation.ok}
            aria-describedby="conn-key-help"
          />
          <div id="conn-key-help" className="flex items-center justify-between text-xs">
            <span className="text-fg-faint">
              {key.length > 0 && !keyValidation.ok
                ? keyValidation.reason
                : "anon key is recommended; service-role gives full access"}
            </span>
            {role && keyValidation.ok && (
              <Badge tone={role === "service_role" ? "danger" : role === "unknown" ? "warn" : "accent"}>
                {ROLE_LABEL[role]}
              </Badge>
            )}
          </div>
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded border hairline bg-bg-sunken px-3 py-2.5">
          <span className="space-y-0.5">
            <span className="block text-sm">Remember on this device</span>
            <span className="block text-xs text-fg-faint">Stores credentials in localStorage. Off → tab-session only.</span>
          </span>
          <Switch checked={remember} onCheckedChange={setRemember} aria-label="Remember credentials on this device" />
        </label>

        {error && <ErrorBanner error={error} />}

        <Button type="submit" disabled={!canSubmit} className="w-full" size="lg">
          {submitting ? (
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent-fg" aria-hidden />
              Introspecting schema…
            </span>
          ) : (
            <span className="flex items-center gap-2">
              Connect <ArrowRight className="h-4 w-4" aria-hidden />
            </span>
          )}
        </Button>
      </form>

      <p className="text-xs text-fg-faint">
        Suparbase never sends your key anywhere except directly to your own Supabase project from this browser.
      </p>

      <ServiceRoleWarning
        open={pendingServiceRole}
        onCancel={() => setPendingServiceRole(false)}
        onConfirm={() => {
          setPendingServiceRole(false);
          void performConnect();
        }}
      />
    </div>
  );
}
