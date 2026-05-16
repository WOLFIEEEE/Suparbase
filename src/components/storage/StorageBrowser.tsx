"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  Database,
  Folder,
  FolderOpen,
  Globe,
  Image as ImageIcon,
  Link2,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ErrorBanner } from "@/components/connections/ErrorBanner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useConfirm } from "@/lib/ui/use-confirm";
import { AppError } from "@/lib/errors";
import { cn } from "@/lib/ui/cn";
import type { ConnectionSummary } from "@/lib/types/connection";

interface Bucket {
  id: string;
  name: string;
  public: boolean;
  fileSizeLimit: number | null;
  allowedMimeTypes: string[] | null;
  createdAt: string;
  updatedAt: string;
}

interface StorageObject {
  name: string;
  isFolder: boolean;
  size: number | null;
  mimeType: string | null;
  lastModified: string | null;
  etag: string | null;
}

const PAGE_SIZE = 50;
const IMAGE_MIME_RE = /^image\/(png|jpeg|jpg|gif|webp|svg\+xml|avif)$/i;

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchBuckets(connectionId: string): Promise<Bucket[]> {
  const res = await fetch(`/api/v/${encodeURIComponent(connectionId)}/storage/buckets`);
  return parse<{ buckets: Bucket[] }>(res).then((j) => j.buckets);
}

async function createBucket(
  connectionId: string,
  body: { name: string; isPublic: boolean },
): Promise<Bucket> {
  const res = await fetch(`/api/v/${encodeURIComponent(connectionId)}/storage/buckets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parse(res);
}

async function deleteBucketApi(connectionId: string, name: string, empty: boolean) {
  const url = `/api/v/${encodeURIComponent(connectionId)}/storage/buckets/${encodeURIComponent(
    name,
  )}${empty ? "?empty=1" : ""}`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) {
    const e = (await res.json().catch(() => null)) as { category?: string; message?: string } | null;
    throw new AppError(
      (e?.category as AppError["category"]) ?? "server",
      e?.message ?? "Failed to delete bucket.",
    );
  }
}

async function fetchObjects(
  connectionId: string,
  bucket: string,
  prefix: string,
  offset: number,
): Promise<{ objects: StorageObject[]; hasMore: boolean }> {
  const res = await fetch(
    `/api/v/${encodeURIComponent(connectionId)}/storage/objects/${encodeURIComponent(bucket)}/list`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit: PAGE_SIZE, offset }),
    },
  );
  return parse(res);
}

async function uploadObjectApi(
  connectionId: string,
  bucket: string,
  prefix: string,
  file: File,
  upsert: boolean,
) {
  const path = prefix ? `${prefix}/${file.name}` : file.name;
  const form = new FormData();
  form.set("file", file);
  form.set("path", path);
  form.set("upsert", upsert ? "true" : "false");
  const res = await fetch(
    `/api/v/${encodeURIComponent(connectionId)}/storage/objects/${encodeURIComponent(bucket)}/upload`,
    { method: "POST", body: form },
  );
  await parse(res);
  return path;
}

async function deleteObjectsApi(connectionId: string, bucket: string, paths: string[]) {
  const res = await fetch(
    `/api/v/${encodeURIComponent(connectionId)}/storage/objects/${encodeURIComponent(bucket)}/delete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths }),
    },
  );
  await parse(res);
}

async function signObjectApi(
  connectionId: string,
  bucket: string,
  path: string,
  expiresIn: number,
): Promise<{ signedUrl: string }> {
  const res = await fetch(
    `/api/v/${encodeURIComponent(connectionId)}/storage/objects/${encodeURIComponent(bucket)}/sign`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, expiresIn }),
    },
  );
  return parse(res);
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    throw new AppError(
      (json.category as AppError["category"] | undefined) ?? "server",
      (json.message as string | undefined) ?? "Request failed.",
    );
  }
  return json as unknown as T;
}

// ---------------------------------------------------------------------------
// Top-level browser
// ---------------------------------------------------------------------------

export function StorageBrowser({ connection }: { connection: ConnectionSummary }) {
  const connectionId = connection.id;
  const qc = useQueryClient();
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const bucketsQuery = useQuery<Bucket[]>({
    queryKey: ["storage", "buckets", connectionId],
    queryFn: () => fetchBuckets(connectionId),
    staleTime: 30_000,
  });

  // Auto-pick the first bucket once we know about them.
  if (selectedBucket === null && bucketsQuery.data && bucketsQuery.data.length > 0) {
    setSelectedBucket(bucketsQuery.data[0]!.name);
  }

  const createMut = useMutation({
    mutationFn: (input: { name: string; isPublic: boolean }) => createBucket(connectionId, input),
    onSuccess: (bucket) => {
      toast.success(`Bucket “${bucket.name}” created.`);
      setCreateOpen(false);
      setSelectedBucket(bucket.name);
      qc.invalidateQueries({ queryKey: ["storage", "buckets", connectionId] });
    },
    onError: (e: AppError) => toast.error(e.message),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <BucketList
        buckets={bucketsQuery.data ?? []}
        isLoading={bucketsQuery.isLoading}
        selected={selectedBucket}
        onSelect={setSelectedBucket}
        onNew={() => setCreateOpen(true)}
        onRefresh={() => bucketsQuery.refetch()}
      />
      <div className="min-w-0">
        {bucketsQuery.error ? (
          <ErrorBanner
            error={
              bucketsQuery.error instanceof AppError
                ? bucketsQuery.error
                : new AppError("server", (bucketsQuery.error as Error).message)
            }
          />
        ) : !bucketsQuery.isLoading && bucketsQuery.data?.length === 0 ? (
          <EmptyBuckets onNew={() => setCreateOpen(true)} />
        ) : selectedBucket ? (
          <ObjectBrowser
            connection={connection}
            bucket={bucketsQuery.data?.find((b) => b.name === selectedBucket) ?? null}
            onDeleteBucket={() => {
              setSelectedBucket(null);
              qc.invalidateQueries({ queryKey: ["storage", "buckets", connectionId] });
            }}
          />
        ) : (
          <p className="text-sm text-fg-muted">Pick a bucket to browse.</p>
        )}
      </div>
      <CreateBucketDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={(v) => createMut.mutate(v)}
        pending={createMut.isPending}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bucket list
// ---------------------------------------------------------------------------

function BucketList({
  buckets,
  isLoading,
  selected,
  onSelect,
  onNew,
  onRefresh,
}: {
  buckets: Bucket[];
  isLoading: boolean;
  selected: string | null;
  onSelect: (name: string) => void;
  onNew: () => void;
  onRefresh: () => void;
}) {
  return (
    <aside className="surface space-y-3 rounded-md p-4">
      <header className="flex items-center justify-between">
        <h3 className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">Buckets</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRefresh}
            className="rounded p-1 text-fg-muted hover:bg-bg-sunken hover:text-fg"
            aria-label="Refresh buckets"
          >
            <RefreshCw className="h-3 w-3" aria-hidden />
          </button>
          <Button size="sm" variant="ghost" onClick={onNew}>
            <Plus className="h-3 w-3" aria-hidden /> New
          </Button>
        </div>
      </header>
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : (
        <ul className="space-y-1">
          {buckets.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => onSelect(b.name)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors",
                  selected === b.name
                    ? "bg-accent/10 text-fg"
                    : "text-fg-muted hover:bg-bg-sunken hover:text-fg",
                )}
              >
                <Database
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    selected === b.name ? "text-accent" : "text-fg-faint",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{b.name}</span>
                {b.public ? (
                  <Globe className="h-3 w-3 shrink-0 text-warn" aria-hidden />
                ) : (
                  <Lock className="h-3 w-3 shrink-0 text-fg-faint" aria-hidden />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function EmptyBuckets({ onNew }: { onNew: () => void }) {
  return (
    <div className="surface rounded-md px-6 py-12 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-bg-sunken">
        <FolderOpen className="h-5 w-5 text-fg-muted" aria-hidden />
      </div>
      <h3 className="mt-3 font-display text-base">No buckets yet</h3>
      <p className="mx-auto mt-1 max-w-md text-xs text-fg-muted">
        Create your first storage bucket. Buckets are containers for files and can be
        public (anyone with the URL can read) or private (signed URLs only).
      </p>
      <Button onClick={onNew} className="mt-4">
        <Plus className="h-3.5 w-3.5" aria-hidden /> New bucket
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Object browser
// ---------------------------------------------------------------------------

interface ObjectBrowserProps {
  connection: ConnectionSummary;
  bucket: Bucket | null;
  onDeleteBucket: () => void;
}

function ObjectBrowser({ connection, bucket, onDeleteBucket }: ObjectBrowserProps) {
  const connectionId = connection.id;
  const qc = useQueryClient();
  const [prefix, setPrefix] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const confirmDeleteBucket = useConfirm();
  const confirmDeleteObjects = useConfirm();
  const [pendingCount, setPendingCount] = useState(0);

  // Reset selection / paging when the bucket or prefix changes.
  const resetState = useCallback(() => {
    setOffset(0);
    setSelected(new Set());
  }, []);

  if (!bucket) return null;

  const listQuery = useQuery({
    queryKey: ["storage", "objects", connectionId, bucket.name, prefix, offset],
    queryFn: () => fetchObjects(connectionId, bucket.name, prefix, offset),
    staleTime: 10_000,
  });

  const uploadMut = useMutation({
    mutationFn: async (files: File[]) => {
      const results: string[] = [];
      for (const f of files) {
        // eslint-disable-next-line no-await-in-loop
        results.push(await uploadObjectApi(connectionId, bucket.name, prefix, f, true));
      }
      return results;
    },
    onSuccess: (paths) => {
      toast.success(`Uploaded ${paths.length} ${paths.length === 1 ? "file" : "files"}.`);
      qc.invalidateQueries({ queryKey: ["storage", "objects", connectionId, bucket.name] });
    },
    onError: (e: AppError) => toast.error(`Upload failed: ${e.message}`),
  });

  const deleteMut = useMutation({
    mutationFn: (paths: string[]) => deleteObjectsApi(connectionId, bucket.name, paths),
    onSuccess: () => {
      toast.success("Deleted.");
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["storage", "objects", connectionId, bucket.name] });
    },
    onError: (e: AppError) => toast.error(e.message),
  });

  const deleteBucketMut = useMutation({
    mutationFn: (empty: boolean) => deleteBucketApi(connectionId, bucket.name, empty),
    onSuccess: () => {
      toast.success(`Bucket “${bucket.name}” deleted.`);
      onDeleteBucket();
    },
    onError: (e: AppError) => toast.error(e.message),
  });

  const onUploadClick = () => fileInputRef.current?.click();

  const onFilesPicked = (fl: FileList | null) => {
    if (!fl || fl.length === 0) return;
    uploadMut.mutate(Array.from(fl));
  };

  const onDrop: React.DragEventHandler = (e) => {
    e.preventDefault();
    if (e.dataTransfer?.files?.length) {
      uploadMut.mutate(Array.from(e.dataTransfer.files));
    }
  };

  const breadcrumbs = useMemo(() => prefix.split("/").filter(Boolean), [prefix]);

  return (
    <section
      className="surface rounded-md p-4"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <header className="space-y-3 border-b hairline pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="flex items-center gap-2 font-display text-base">
              <Database className="h-4 w-4 text-fg-muted" aria-hidden />
              {bucket.name}
              {bucket.public ? (
                <Badge tone="warn">
                  <Globe className="h-3 w-3" aria-hidden /> public
                </Badge>
              ) : (
                <Badge>
                  <Lock className="h-3 w-3" aria-hidden /> private
                </Badge>
              )}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => listQuery.refetch()}
              disabled={listQuery.isFetching}
              aria-label="Refresh objects"
            >
              <RefreshCw
                className={cn("h-3 w-3", listQuery.isFetching && "animate-spin")}
                aria-hidden
              />
            </Button>
            <Button size="sm" variant="secondary" onClick={onUploadClick} disabled={uploadMut.isPending}>
              {uploadMut.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              ) : (
                <Upload className="h-3 w-3" aria-hidden />
              )}
              Upload
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => confirmDeleteBucket.ask(() => deleteBucketMut.mutate(true))}
              disabled={deleteBucketMut.isPending}
              aria-label="Delete bucket"
            >
              <Trash2 className="h-3 w-3 text-danger" aria-hidden />
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="sr-only"
            onChange={(e) => {
              onFilesPicked(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        <Breadcrumbs
          segments={breadcrumbs}
          onSelect={(idx) => {
            setPrefix(idx < 0 ? "" : breadcrumbs.slice(0, idx + 1).join("/"));
            resetState();
          }}
        />
      </header>

      {listQuery.error ? (
        <div className="pt-4">
          <ErrorBanner
            error={
              listQuery.error instanceof AppError
                ? listQuery.error
                : new AppError("server", (listQuery.error as Error).message)
            }
          />
        </div>
      ) : listQuery.isLoading ? (
        <div className="space-y-2 pt-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : listQuery.data && listQuery.data.objects.length === 0 ? (
        <EmptyFolder onUpload={onUploadClick} pending={uploadMut.isPending} />
      ) : (
        <ObjectTable
          connection={connection}
          bucket={bucket}
          prefix={prefix}
          objects={listQuery.data?.objects ?? []}
          selected={selected}
          onToggle={(name) => {
            const next = new Set(selected);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            setSelected(next);
          }}
          onOpenFolder={(name) => {
            setPrefix(prefix ? `${prefix}/${name}` : name);
            resetState();
          }}
        />
      )}

      <footer className="mt-4 flex items-center justify-between gap-2 text-xs text-fg-muted">
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <span className="text-fg">{selected.size} selected</span>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  const paths = Array.from(selected).map((n) =>
                    prefix ? `${prefix}/${n}` : n,
                  );
                  setPendingCount(paths.length);
                  confirmDeleteObjects.ask(() => deleteMut.mutate(paths));
                }}
                disabled={deleteMut.isPending}
              >
                {deleteMut.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="h-3 w-3" aria-hidden />
                )}
                Delete selected
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={offset === 0 || listQuery.isFetching}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            <ArrowLeft className="h-3 w-3" aria-hidden />
            Prev
          </Button>
          <span className="px-2 tabular-nums">
            {offset + 1}–{offset + (listQuery.data?.objects.length ?? 0)}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={!listQuery.data?.hasMore || listQuery.isFetching}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Next
            <ChevronRight className="h-3 w-3" aria-hidden />
          </Button>
        </div>
      </footer>
      <ConfirmDialog
        {...confirmDeleteBucket.dialogProps}
        title={`Delete bucket "${bucket?.name ?? ""}"?`}
        description={
          <>
            Permanently deletes the bucket and <strong>every object inside it</strong>.
            This cannot be undone.
          </>
        }
        confirmLabel="Delete bucket"
        tone="danger"
        requireText="DELETE"
      />
      <ConfirmDialog
        {...confirmDeleteObjects.dialogProps}
        title={`Delete ${pendingCount} object${pendingCount === 1 ? "" : "s"}?`}
        description="The objects are removed from the bucket immediately. This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
      />
    </section>
  );
}

function EmptyFolder({ onUpload, pending }: { onUpload: () => void; pending: boolean }) {
  return (
    <div className="rounded-md border border-dashed hairline px-6 py-12 text-center text-sm text-fg-muted">
      <FolderOpen className="mx-auto h-5 w-5 text-fg-faint" aria-hidden />
      <p className="mt-2">Nothing in this folder yet: drag a file here, or use Upload.</p>
      <Button onClick={onUpload} variant="secondary" size="sm" className="mt-3" disabled={pending}>
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        ) : (
          <Upload className="h-3 w-3" aria-hidden />
        )}
        Upload a file
      </Button>
    </div>
  );
}

function Breadcrumbs({
  segments,
  onSelect,
}: {
  segments: string[];
  onSelect: (idx: number) => void;
}) {
  return (
    <nav className="flex items-center gap-1 text-xs">
      <button
        type="button"
        onClick={() => onSelect(-1)}
        className="rounded px-1.5 py-0.5 text-fg-muted hover:bg-bg-sunken hover:text-fg"
      >
        root
      </button>
      {segments.map((seg, i) => (
        <span key={i} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 text-fg-faint" aria-hidden />
          <button
            type="button"
            onClick={() => onSelect(i)}
            className="rounded px-1.5 py-0.5 font-mono text-fg-muted hover:bg-bg-sunken hover:text-fg"
          >
            {seg}
          </button>
        </span>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Object table
// ---------------------------------------------------------------------------

interface ObjectTableProps {
  connection: ConnectionSummary;
  bucket: Bucket;
  prefix: string;
  objects: StorageObject[];
  selected: Set<string>;
  onToggle: (name: string) => void;
  onOpenFolder: (name: string) => void;
}

function ObjectTable({
  connection,
  bucket,
  prefix,
  objects,
  selected,
  onToggle,
  onOpenFolder,
}: ObjectTableProps) {
  return (
    <ul className="divide-y hairline pt-2">
      {objects.map((o) => {
        const fullPath = prefix ? `${prefix}/${o.name}` : o.name;
        return (
          <li key={o.name} className="flex items-center gap-3 px-2 py-2 text-sm">
            {!o.isFolder ? (
              <input
                type="checkbox"
                className="h-3.5 w-3.5 cursor-pointer accent-accent"
                checked={selected.has(o.name)}
                onChange={() => onToggle(o.name)}
                aria-label={`Select ${o.name}`}
              />
            ) : (
              <span className="h-3.5 w-3.5" />
            )}
            <button
              type="button"
              onClick={() => o.isFolder && onOpenFolder(o.name)}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-0.5 text-left",
                o.isFolder && "hover:bg-bg-sunken",
              )}
            >
              <ObjectIcon obj={o} />
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{o.name}</span>
            </button>
            <span className="hidden w-24 shrink-0 text-right font-mono text-[10px] text-fg-faint sm:inline">
              {o.isFolder ? ":" : formatBytes(o.size)}
            </span>
            <span className="hidden w-28 shrink-0 truncate text-right font-mono text-[10px] text-fg-faint md:inline">
              {o.isFolder ? "" : o.mimeType ?? ""}
            </span>
            {!o.isFolder && (
              <ObjectActions
                connection={connection}
                bucketName={bucket.name}
                bucketIsPublic={bucket.public}
                objectPath={fullPath}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ObjectIcon({ obj }: { obj: StorageObject }) {
  if (obj.isFolder) return <Folder className="h-3.5 w-3.5 text-accent" aria-hidden />;
  if (obj.mimeType && IMAGE_MIME_RE.test(obj.mimeType))
    return <ImageIcon className="h-3.5 w-3.5 text-fg-muted" aria-hidden />;
  return <Database className="h-3.5 w-3.5 text-fg-muted" aria-hidden />;
}

function ObjectActions({
  connection,
  bucketName,
  bucketIsPublic,
  objectPath,
}: {
  connection: ConnectionSummary;
  bucketName: string;
  bucketIsPublic: boolean;
  objectPath: string;
}) {
  const [busy, setBusy] = useState(false);

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("URL copied to clipboard.");
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  };

  const onSign = async () => {
    setBusy(true);
    try {
      const data = await signObjectApi(connection.id, bucketName, objectPath, 3600);
      await copy(data.signedUrl);
    } catch (e) {
      toast.error((e as AppError).message ?? "Failed to sign.");
    } finally {
      setBusy(false);
    }
  };

  const onCopyPublic = async () => {
    const safe = objectPath.split("/").map(encodeURIComponent).join("/");
    const publicUrl = `${connection.url}/storage/v1/object/public/${encodeURIComponent(
      bucketName,
    )}/${safe}`;
    await copy(publicUrl);
  };

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        size="sm"
        variant="ghost"
        onClick={onSign}
        disabled={busy}
        title="Copy a 1-hour signed URL"
      >
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        ) : (
          <Link2 className="h-3 w-3" aria-hidden />
        )}
        Sign
      </Button>
      {bucketIsPublic && (
        <Button
          size="sm"
          variant="ghost"
          onClick={onCopyPublic}
          title="Copy public URL"
          aria-label="Copy public URL"
        >
          <Copy className="h-3 w-3" aria-hidden />
        </Button>
      )}
    </div>
  );
}

function formatBytes(n: number | null): string {
  if (n == null) return ":";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ---------------------------------------------------------------------------
// Create bucket dialog
// ---------------------------------------------------------------------------

function CreateBucketDialog({
  open,
  onClose,
  onSubmit,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (v: { name: string; isPublic: boolean }) => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setName("");
          setIsPublic(false);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogTitle>New bucket</DialogTitle>
        <DialogDescription>
          Buckets group files together. Public buckets serve files at a stable URL;
          private buckets need a signed URL per request.
        </DialogDescription>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onSubmit({ name: name.trim(), isPublic });
          }}
          className="space-y-3"
        >
          <label className="block space-y-1">
            <span className="text-xs text-fg-muted">Name</span>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase())}
              placeholder="avatars"
              className="font-mono"
            />
            <p className="text-[10px] text-fg-faint">
              Lowercase letters, numbers, dots, dashes, underscores. 1-64 chars.
            </p>
          </label>
          <label className="flex items-center gap-2 text-xs text-fg-muted">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer accent-accent"
            />
            <Globe className="h-3.5 w-3.5 text-warn" aria-hidden />
            Make this bucket <strong>public</strong>
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              <X className="h-3 w-3" aria-hidden /> Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Check className="h-3 w-3" aria-hidden />}
              Create bucket
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
