export function RouteLoader() {
  return (
    <div className="flex h-screen w-full items-center justify-center" role="status" aria-label="Loading">
      <div className="h-2 w-2 animate-pulse-soft rounded-full bg-accent" />
    </div>
  );
}
