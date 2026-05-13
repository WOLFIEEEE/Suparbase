import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/workspace/EmptyState";

export function NotFoundRoute() {
  useEffect(() => {
    document.title = "Not found — Suparbase";
  }, []);
  return (
    <EmptyState
      title="404 · not here"
      description="This URL doesn't map to a route in the workspace."
      action={
        <Button asChild>
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      }
    />
  );
}
