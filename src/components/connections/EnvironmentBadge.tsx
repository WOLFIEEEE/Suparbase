import { Badge } from "@/components/ui/badge";
import { ENVIRONMENT_META } from "@/lib/ui/environment";
import type { ConnectionEnvironment } from "@/lib/types/connection";
import { cn } from "@/lib/ui/cn";

/**
 * Small pill showing the connection's environment. Renders nothing when
 * the environment is unset so unlabelled connections stay quiet.
 */
export function EnvironmentBadge({
  environment,
  className,
}: {
  environment: ConnectionEnvironment | null | undefined;
  className?: string;
}) {
  if (!environment) return null;
  const meta = ENVIRONMENT_META[environment];
  return (
    <Badge
      tone={meta.tone}
      className={cn(environment === "production" && "font-semibold", className)}
      title={meta.hint}
    >
      {meta.label}
    </Badge>
  );
}
