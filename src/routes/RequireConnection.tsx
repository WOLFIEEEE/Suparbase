import { Navigate, useLocation } from "react-router-dom";
import { useConnection } from "@/lib/connection/context";

export function RequireConnection({ children }: { children: React.ReactNode }) {
  const { connection } = useConnection();
  const location = useLocation();
  if (!connection) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/?next=${next}`} replace />;
  }
  return <>{children}</>;
}
