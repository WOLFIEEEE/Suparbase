import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { redact } from "@/lib/redact";

interface State {
  error: Error | null;
}

interface Props {
  children: ReactNode;
  /** When this key changes, the boundary resets (e.g., on route change). */
  resetKey?: string | number;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    // Keys could appear in any thrown message — defensively redact before any logging.
    // We intentionally do not call console.error here; redact() would let a single
    // mistake leak credentials. Surface to the user instead.
    void redact(error.message);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[50vh] items-center justify-center p-6">
          <div className="surface w-full max-w-md space-y-4 rounded p-6">
            <div className="flex items-center gap-2 text-danger">
              <AlertTriangle className="h-5 w-5" aria-hidden />
              <h2 className="text-lg font-medium">Something went wrong</h2>
            </div>
            <p className="text-sm text-fg-muted">
              The screen hit an unexpected error. Your connection and data are
              fine — try again.
            </p>
            <pre className="max-h-32 overflow-auto rounded surface-sunken p-3 font-mono text-[11px] text-fg-muted">
              {redact(this.state.error.message || "unknown error")}
            </pre>
            <div className="flex gap-2">
              <Button onClick={this.reset} variant="primary">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Retry
              </Button>
              <Button onClick={() => window.location.reload()} variant="ghost">
                Reload page
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
