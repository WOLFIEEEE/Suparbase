import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { ConnectionProvider } from "@/lib/connection/context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RequireConnection } from "@/routes/RequireConnection";
import { ConnectRoute } from "@/routes/ConnectRoute";
import { RouteLoader } from "@/components/workspace/RouteLoader";

const WorkspaceLayout = lazy(() =>
  import("@/routes/WorkspaceLayout").then((m) => ({ default: m.WorkspaceLayout })),
);
const DashboardRoute = lazy(() =>
  import("@/routes/DashboardRoute").then((m) => ({ default: m.DashboardRoute })),
);
const TablesRoute = lazy(() =>
  import("@/routes/TablesRoute").then((m) => ({ default: m.TablesRoute })),
);
const TableListRoute = lazy(() =>
  import("@/routes/TableListRoute").then((m) => ({ default: m.TableListRoute })),
);
const TableNewRoute = lazy(() =>
  import("@/routes/TableNewRoute").then((m) => ({ default: m.TableNewRoute })),
);
const TableRowRoute = lazy(() =>
  import("@/routes/TableRowRoute").then((m) => ({ default: m.TableRowRoute })),
);
const SchemaRoute = lazy(() =>
  import("@/routes/SchemaRoute").then((m) => ({ default: m.SchemaRoute })),
);
const SettingsRoute = lazy(() =>
  import("@/routes/SettingsRoute").then((m) => ({ default: m.SettingsRoute })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const status = (error as { status?: number })?.status;
        if (status === 401 || status === 403 || status === 404) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConnectionProvider>
        <TooltipProvider delayDuration={200}>
          <BrowserRouter>
            <Suspense fallback={<RouteLoader />}>
              <Routes>
                <Route path="/" element={<ConnectRoute />} />
                <Route
                  element={
                    <RequireConnection>
                      <WorkspaceLayout />
                    </RequireConnection>
                  }
                >
                  <Route path="/dashboard" element={<DashboardRoute />} />
                  <Route path="/tables" element={<TablesRoute />} />
                  <Route path="/tables/:name" element={<TableListRoute />} />
                  <Route path="/tables/:name/new" element={<TableNewRoute />} />
                  <Route path="/tables/:name/:pk" element={<TableRowRoute />} />
                  <Route path="/schema" element={<SchemaRoute />} />
                  <Route path="/settings" element={<SettingsRoute />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "rgb(18 18 20)",
              color: "rgb(245 245 241)",
              border: "1px solid rgb(38 38 42)",
            },
          }}
        />
      </ConnectionProvider>
    </QueryClientProvider>
  );
}
