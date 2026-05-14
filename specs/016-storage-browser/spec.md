# Storage browser (v1.3)

## Goal
Browse and manage files in Supabase Storage from inside the workspace
— list buckets, drill into folders, upload, delete, generate signed
and public URLs.

## Server
- `src/server/proxy/storage.ts` — typed wrappers around Supabase's
  `/storage/v1/*` API using the same encrypted PostgREST key:
  - `listBuckets` / `createBucket` / `deleteBucket(empty?)`
  - `listObjects(bucket, prefix, limit, offset)` — `limit+1` trick to
    detect pagination
  - `uploadObject(bucket, path, blob, contentType, upsert?)` — Blob
    stream, 120s timeout
  - `deleteObjects(bucket, paths[])` — bulk delete
  - `signObject(bucket, path, expiresIn)` — returns absolute signed
    URL
  - `publicUrl(bucket, path)` — pure helper, no network call
- All helpers throw a typed `StorageApiError(category, message, status)`
  with PostgREST-style categories so the existing `ErrorBanner` works.

## API
- `GET  /api/v/[id]/storage/buckets` → `{buckets}`
- `POST /api/v/[id]/storage/buckets` → create
- `DELETE /api/v/[id]/storage/buckets/[bucket]?empty=1` → delete
- `POST /api/v/[id]/storage/objects/[bucket]/list` → paginated list
- `POST /api/v/[id]/storage/objects/[bucket]/upload` → multipart, 50MB
  cap, write-rate-limited
- `POST /api/v/[id]/storage/objects/[bucket]/delete` → `{paths[]}`
- `POST /api/v/[id]/storage/objects/[bucket]/sign` → `{path, expiresIn}`

## UX
- Sidebar entry `Storage`.
- Two-pane page: bucket list (left), object browser (right).
- Bucket list shows public/private status as icon. New + Refresh actions.
- Object browser breadcrumbs from prefix; click a folder to drill in;
  click "root" to reset.
- Drag-drop or Upload button — supports multiple files; uses
  `upsert: true` so re-uploading the same name replaces.
- Multi-select with checkboxes → bulk delete.
- Per-file `Sign` button copies a 1h signed URL; for public buckets a
  `Copy` button copies the constructed public URL.
- Create-bucket dialog with name validator + public toggle.
- Delete-bucket button on the header (with confirm) uses `empty=1` to
  cascade-delete contents.

## Out of scope (v1.3)
- Move / rename objects.
- Edit bucket settings (size limit, mime allowlist) after creation.
- Inline preview for non-image types (PDF, video).
- Multi-part / resumable uploads above 50MB.
- Folder-as-zip download.
