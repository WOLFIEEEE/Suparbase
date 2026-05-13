# Contract — Route Map

| Path                              | Component             | Guard               | URL state                                  | Notes                                  |
|-----------------------------------|-----------------------|---------------------|--------------------------------------------|----------------------------------------|
| `/`                               | `ConnectRoute`        | none (redirect to `/dashboard` if connected) | —                          | Landing + connect form                 |
| `/dashboard`                      | `DashboardRoute`      | `RequireConnection` | —                                          | Project overview, table tiles          |
| `/tables`                         | `TablesRoute`         | `RequireConnection` | —                                          | All tables list                        |
| `/tables/:name`                   | `TableListRoute`      | `RequireConnection` | `?page=1&size=25&sort=col.asc&q=`          | Data grid                              |
| `/tables/:name/new`               | `TableNewRoute`       | `RequireConnection` | —                                          | Create form                            |
| `/tables/:name/:pk`               | `TableRowRoute`       | `RequireConnection` | `?edit=1`                                  | Detail view; toggles to edit form      |
| `/schema`                         | `SchemaRoute`         | `RequireConnection` | —                                          | Schema overview                        |
| `/settings`                       | `SettingsRoute`       | `RequireConnection` | —                                          | Disconnect, project info               |
| `*`                               | `NotFoundRoute`       | none                | —                                          | 404                                    |

## Guards

- `RequireConnection`: reads `useConnection()`; if `null`, redirects to `/`
  with `?next=<encoded original path>`. On successful connect, the connect
  route honors `?next` to return.
- The connect route redirects to `/dashboard` (or `?next`) when a connection
  exists.

## URL state encoding

For `/tables/:name`:

- `page`: integer ≥ 1, default 1
- `size`: one of `10|25|50|100`, default 25
- `sort`: `${columnName}.${"asc"|"desc"}` or absent
- `q`: search term, URL-encoded

For `/tables/:name/:pk`:

- `pk` segment is the URL-encoded primary key. Single-column PK → just the
  value. Composite PK → `colA-valA__colB-valB` (colons and equals avoided to
  keep URLs clean).
- `?edit=1` opens in edit mode.
