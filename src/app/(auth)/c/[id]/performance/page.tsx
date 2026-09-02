import type { Metadata } from "next";
import { PerformanceView } from "@/components/workspace/PerformanceView";

export const metadata: Metadata = { title: "Performance · Suparbase" };

export default function PerformancePage() {
  return <PerformanceView />;
}
