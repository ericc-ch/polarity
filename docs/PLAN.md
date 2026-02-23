# GitHub Issue and Pull Request Vectorization Architecture

This document outlines the system for indexing GitHub repositories, generating text embeddings, and serving the vector data to a static frontend. The architecture relies entirely on the Cloudflare ecosystem to minimize costs and scale to thousands of repositories.

## Core Infrastructure

**Cloudflare D1** stores repository metadata only:

- Repository identification and sync state
- Timestamps for GitHub API filtering
- Sync status tracking

**Cloudflare R2** holds the actual vector data:

- **One vector object per repository** - no snapshots, no history
- Object is overwritten on each sync
- Cheap storage with zero-cost egress

**Cloudflare Pages** hosts the static web application.

**Cloudflare Workers** is the single backend service:

- HTTP endpoints for repository management and manual sync
- Cron trigger handler for daily scheduled sync
- All operations run in the same Worker code

## Worker Architecture

The Worker handles both HTTP requests and scheduled events in a single codebase:

```typescript
export default {
  // HTTP requests from frontend
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // Route to API handlers
    // POST /api/repos - Add repo
    // POST /api/repos/:owner/:repo/sync - Manual sync ("Index now")
    // etc.
  },

  // Cron trigger (daily at 2 AM)
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    // Query D1 for all active repos
    // For each repo: run syncRepo(repo)
  },
}
```

**Shared Functions**:

Both entry points call the same core functions:

- `backfillRepo(repo)` - Initial backfill (open items only)
- `syncRepo(repo)` - Daily sync or manual trigger (all items + deletions)
- `generateEmbeddings(items)` - Call Gemini API
- `writeVectorObject(repo, data)` - Write to R2
- `updateRepoStatus(repo, status)` - Update D1

This ensures consistent behavior whether triggered by cron or by user action.

## Data Model

### D1 Schema

```sql
repositories
- full_name TEXT PRIMARY KEY      -- "owner/repo" format
- status TEXT DEFAULT 'pending'   -- Current operation state
- last_sync_at INTEGER DEFAULT 0  -- Unix timestamp, filters GitHub API
- error_message TEXT              -- Last error (if status='error')
- created_at INTEGER
- updated_at INTEGER
```

**Status values:**

| Status          | Description                                    | Transitions To                     |
| --------------- | ---------------------------------------------- | ---------------------------------- |
| `'pending'`     | Just added, waiting for backfill               | `backfilling`                      |
| `'backfilling'` | Initial backfill (open items only) in progress | `active` or `error`                |
| `'syncing'`     | Daily sync or manual "Index now" in progress   | `active` or `error`                |
| `'active'`      | Ready to use, last operation succeeded         | `syncing` (on trigger)             |
| `'error'`       | Last operation failed, check error_message     | `syncing` (retry) or `backfilling` |

**Status purposes:**

1. **Frontend indicator**: Shows appropriate UI state (loading, error, etc.)
2. **Trigger gating**: Prevents duplicate syncs (can't trigger if already syncing/backfilling)
3. **Crash recovery**: Resume interrupted operations on next worker run
4. **Atomicity**: D1 row exists immediately with status, R2 write happens later
5. **Error visibility**: Users can see what went wrong

### Vector Object Structure

Each repository has exactly one vector object in R2, stored as gzipped JSON:

```typescript
interface VectorObject {
  repo: string // "owner/repo" format
  syncedAt: number // Unix timestamp of last sync
  issues: { [id: number]: Issue }
  pullRequests: { [id: number]: PullRequest }
}

interface Issue {
  number: number
  title: string
  body: string
  state: "open" | "closed"
  author: string
  labels: string[]
  createdAt: string // ISO 8601 timestamp
  updatedAt: string // ISO 8601 timestamp
  vector: number[] // 768-dimension embedding
}

interface PullRequest {
  number: number
  title: string
  body: string
  state: "open" | "closed"
  author: string
  labels: string[]
  createdAt: string // ISO 8601 timestamp
  updatedAt: string // ISO 8601 timestamp
  mergedAt: string | null // ISO 8601 timestamp or null
  vector: number[] // 768-dimension embedding
}
```

Objects keyed by ID (not arrays) enable O(1) replacement/deletion. Metadata includes core fields needed for display: number, title, body, state, author, labels, timestamps.

### R2 Storage Layout

```
{owner}/{repo}.json.gz
```

Examples:

- `facebook/react.json.gz`
- `vercel/next.js.json.gz`

Each file is the **only** vector data for that repository. Format: JSON compressed with gzip. Debuggable (`gunzip | jq`), no extra dependencies.

## Backfill Strategy

### Phase 1: Initial Backfill (Open Items Only)

When a repository is first added:

1. **Insert D1 row** with `status='backfilling'`, `last_sync_at=null`
2. **Paginate GitHub API** with `state=open` filter:
   - Get all open issues (100 per page)
   - Get all open PRs (100 per page)
3. **Generate embeddings** for all items
4. **Write vector object** to R2
5. **Update D1**: Set `status='active'`, `last_sync_at=now()`

This keeps initial backfill fast by skipping closed/merged history.

### Phase 2: Daily Sync (All Updated Items + Deletion)

A Scheduled Worker runs once per day:

1. **Query D1** for active repositories where `status='active'`
2. **Fetch from GitHub API** using `since={last_sync_at}`:
   - Get ALL issues updated since last sync (state=open and closed)
   - Get ALL PRs updated since last sync (state=open, closed, merged)
3. **Fetch current vector object** from R2 (if exists)
4. **Merge with deletion logic**:
   - For each item in API response:
     - If state is "open" → generate/update embedding, add to object
     - If state is "closed" or "merged" → delete from object (don't generate embedding)
5. **Write vector object** back to R2 (overwrite)
6. **Update D1**: Set `status='active'`, `last_sync_at=now()`

**Why this works:**

- Items that close will be returned by `since=` on next sync
- We detect closed state and remove them from the vector object
- Open items continue to accumulate
- No explicit "deleted items" tracking needed

## Architecture Decisions

### 1. Frontend Access: Direct R2 Fetch

**Decision**: Frontend fetches vector data directly from R2 with predictable URL

- URL pattern: `/{owner}/{repo}.json.gz`
- No discovery needed - single object per repo
- Frontend caches `syncedAt` timestamp to know if data is stale
- Skip repos where `status != 'active'` (show loading/error state instead)
- Benefits:
  - No D1 reads for vector access
  - Zero egress cost from R2
  - Simple frontend logic

### 2. One Object Per Repository

**Decision**: Each repository has exactly one vector object in R2

- Overwritten on each sync
- No versioning, no history
- Significantly simpler architecture
- Storage bounded: one file per repo

### 3. Backfill: Open Items Only First

**Decision**: Initial backfill only indexes open issues/PRs

- Reduces time to first usable data
- Closed/merged items removed naturally via daily sync
- Large repos (10k+ issues) backfill in reasonable time

### 4. Daily Sync: Delete Closed Items

**Decision**: Daily sync fetches all updated items and deletes closed/merged

- API returns items regardless of state when using `since=`
- Check state in response, delete from vector object if closed
- Clean vector set contains only currently open items

### 5. Sync Failure Handling: Skip and Retry

**Decision**: On failure, skip and retry next day with wider `since` window

- No special failure tracking
- Next daily run will pick up missed items with larger window
- No alerting/manual intervention for MVP

### 6. Sync Schedule: Daily

**Decision**: Run sync once per day instead of hourly

- Reduces API usage and costs
- Acceptable latency for this use case
- Frontend shows "last synced: X hours ago" for transparency

### 7. Multiple Vector Versions: Out of Scope

**Decision**: Defer support for multiple embedding versions

- Single embedding model (Gemini 768-dim) for MVP
- If model changes later, re-index from scratch

### 8. Repository Deletion: Delete R2 + D1

**Decision**: Delete both D1 row and R2 object on repo removal

- Delete D1: `DELETE FROM repositories WHERE full_name = ?`
- Delete R2: `/{owner}/{repo}.json.gz`
- Clean state after removal

### 9. Status Field for State Management

**Decision**: Use status enum for operation state tracking

- Single source of truth for repo state
- Frontend can show loading, error, or ready states
- Worker can resume interrupted operations by checking status on startup
- Errors are visible to users via error_message field

### 10. Manual Sync Trigger ("Index Now")

**Decision**: Frontend can trigger immediate sync via API endpoint

- Same sync logic as daily cron, just different entry point
- Returns immediately (202 Accepted), runs async
- Prevents duplicate triggers (checks status != 'syncing')
- Use cases: fresh data on demand, debugging, testing

## Scheduling

### Daily Sync (Cron Trigger)

Cloudflare Workers includes **Cron Triggers** - built-in scheduling without external services.

**Configuration**:

- Schedule: `0 2 * * *` (2 AM UTC daily)
- Configured in `wrangler.toml` or Cloudflare Dashboard
- Worker receives `scheduled` event type

**Behavior**:

- Queries D1 for all repositories with `status='active'`
- Runs sync process for each (same logic as manual trigger)
- Updates `status` to 'syncing' at start, 'active' or 'error' on completion
- Runs sequentially to avoid rate limits

### Manual Sync ("Index Now" Button)

Frontend can trigger immediate sync without waiting for schedule:

**Trigger Sync**

```
POST /api/repos/:owner/:repo/sync
Response: { full_name, status: "syncing", last_sync_at }
Note: Triggers sync immediately, returns immediately (async)
```

**Use cases**:

- User wants fresh data now
- Debugging sync issues
- Testing after adding new repo

**Implementation note**: Manual sync and daily cron use the **same sync function** - just different entry points.

## API Contract

### Repository Management Endpoints

**List Repositories**

```
GET /api/repos
Response: [{ full_name, last_sync_at, status, error_message }]
```

**Add Repository**

```
POST /api/repos
Body: { full_name: "owner/repo" }
Response: { full_name, last_sync_at, status: "backfilling" }
Note: Triggers async backfill process
```

**Trigger Sync (Manual)**

```
POST /api/repos/:owner/:repo/sync
Response: { full_name, status: "syncing", last_sync_at }
Note: Triggers immediate sync, returns immediately
```

**Remove Repository**

```
DELETE /api/repos/:owner/:repo
Response: 204 No Content
Note: Deletes D1 row and R2 object
```

### Vector Access (Frontend)

Vectors are fetched directly from R2:

**Fetch Vector Object**

```
GET https://r2.example.com/{owner}/{repo}.json.gz
```

No discovery needed - single predictable URL per repo.

Frontend logic:

1. User selects repo from D1-fetched list
2. If `status != 'active'`, show appropriate state:
   - 'pending'/'backfilling'/'syncing' → "Indexing..." loading
   - 'error' → Show error message from error_message field
3. Else (status='active') fetch `/{owner}/{repo}.json.gz` from R2
4. Decompress and parse JSON
5. Render vectors with `syncedAt` timestamp shown

## Data Flow Summary

```
Daily Scheduled Sync (Cron Trigger):
  Worker receives scheduled event →
    Query D1 for repos with status='active' →
      For each repo:
        Run syncRepo(repo) function →
          Update D1 status='syncing' →
          Fetch GitHub API (since last_sync_at, all states) →
          Fetch current vector object from R2 →
          Merge: update opens, delete closed/merged →
          Write vector object back to R2 →
          Update D1 (status='active', last_sync_at=now())

Manual Sync ("Index Now" button):
  Frontend POST /api/repos/:owner/:repo/sync →
    Worker HTTP handler →
      Run syncRepo(repo) function (same as above) →
      Return 202 Accepted immediately

Backfill (on repo add):
  Insert D1 row (status='backfilling') →
    Run backfillRepo(repo) function →
      Paginate GitHub API (state=open only, 100/page) →
        Generate all embeddings →
        Write vector object to R2 →
        Update D1 (status='active', last_sync_at=now())
```

**Frontend:**

```
Load page →
  Query D1 for repo list →
    User selects repo →
      Check status:
        'pending'/'backfilling'/'syncing' → show loading
        'error' → show error message
        'active' → GET vector object from R2 → Render vectors
```

## Vector Data Structure

### Overview

Each repository stores exactly one vector object in R2. This object contains all currently open issues and pull requests with their embeddings.

### R2 Object Format

**Path**: `{owner}/{repo}.json.gz`

**Content** (decompressed JSON):

```json
{
  "repo": "facebook/react",
  "syncedAt": 1704067200,
  "issues": {
    "1234": {
      "number": 1234,
      "title": "Fix useEffect cleanup timing",
      "body": "This PR addresses the issue where...",
      "state": "open",
      "author": "sophiebits",
      "labels": ["bug", "react-core"],
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-16T14:22:00Z",
      "vector": [0.023, -0.156, 0.892, ...]
    },
    "1235": { ... }
  },
  "pullRequests": {
    "5678": {
      "number": 5678,
      "title": "Add concurrent mode documentation",
      "body": "This adds comprehensive docs...",
      "state": "open",
      "author": "acdlite",
      "labels": ["documentation"],
      "createdAt": "2024-01-14T09:15:00Z",
      "updatedAt": "2024-01-15T11:45:00Z",
      "mergedAt": null,
      "vector": [-0.134, 0.567, 0.234, ...]
    }
  }
}
```

### Field Definitions

#### Top-Level Fields

| Field          | Type   | Description                                    |
| -------------- | ------ | ---------------------------------------------- |
| `repo`         | string | Full repo name "owner/repo"                    |
| `syncedAt`     | number | Unix timestamp of last sync                    |
| `issues`       | object | Keyed by issue number `{ [number]: Issue }`    |
| `pullRequests` | object | Keyed by PR number `{ [number]: PullRequest }` |

#### Issue Fields

| Field       | Type               | Description                               |
| ----------- | ------------------ | ----------------------------------------- |
| `number`    | number             | GitHub issue number (also the object key) |
| `title`     | string             | Issue title (plain text)                  |
| `body`      | string             | Issue body (markdown preserved)           |
| `state`     | "open" \| "closed" | Current state                             |
| `author`    | string             | GitHub username                           |
| `labels`    | string[]           | Array of label names                      |
| `createdAt` | string             | ISO 8601 timestamp                        |
| `updatedAt` | string             | ISO 8601 timestamp                        |
| `vector`    | number[]           | 768-dimension embedding                   |

#### Pull Request Fields

All Issue fields plus:

| Field      | Type           | Description                  |
| ---------- | -------------- | ---------------------------- |
| `mergedAt` | string \| null | ISO 8601 timestamp if merged |

### Embedding Generation

**Input text format**:

```
Title: {title}

Body:
{body}
```

**Processing**:

1. Concatenate title and body with separator
2. Strip excessive whitespace (normalize newlines)
3. Truncate to model's max input tokens (Gemini: 8k tokens)
4. Generate 768-dimension embedding via Gemini API
5. Store as float32 array

**Why 768 dimensions?**

- Gemini text-embedding-004 outputs 768 dimensions
- Good balance of quality vs storage size
- 768 floats × 4 bytes = ~3KB per vector
- 10k issues = ~30MB (compressed: ~5-10MB)

### Size Estimates

| Repo Size | Issues | PRs   | Uncompressed | Gzipped |
| --------- | ------ | ----- | ------------ | ------- |
| Small     | 100    | 20    | ~400KB       | ~80KB   |
| Medium    | 1,000  | 200   | ~4MB         | ~800KB  |
| Large     | 10,000 | 1,000 | ~40MB        | ~8MB    |

### Why Keyed Objects Instead of Arrays?

**Keyed objects** (`{ "1234": {...}, "1235": {...} }`) vs **Arrays** (`[{...}, {...}]`):

**Array format:**

```json
{
  "issues": [
    { "number": 1234, "title": "Fix bug" },
    { "number": 1235, "title": "Add feature" }
  ]
}
```

**Keyed object format:**

```json
{
  "issues": {
    "1234": { "number": 1234, "title": "Fix bug" },
    "1235": { "number": 1235, "title": "Add feature" }
  }
}
```

**Why objects are slightly larger:**

- The ID appears twice: once as the object key `"1234"`, once as the field `"number": 1234`
- Keys are strings in JSON, so `"1234"` takes 6 bytes vs `1234` as a number taking ~4 bytes
- Roughly 5-10% larger before compression

**Why it's still worth it:**

- O(1) lookup, update, deletion (no array scanning)
- Gzip compresses the repeated keys and structure very well
- Net size difference after gzip: ~2-5%
- Much faster merge operations during daily sync

### Closed Item Handling

Items are **removed** from the vector object when closed/merged:

1. Daily sync fetches all items updated since last sync
2. For each item in response:
   - If `state === "open"` → generate embedding, add/update in object
   - If `state === "closed"` or `mergedAt !== null` → `delete` from object
3. Write updated object back to R2

Result: Vector object only contains currently open issues/PRs.

## Pagination Strategy

GitHub API supports 100 items per page maximum.

**Backfill:**

- Use `per_page=100`
- Paginate through all open issues: `GET /repos/{owner}/{repo}/issues?state=open&per_page=100&page={n}`
- Paginate through all open PRs: `GET /repos/{owner}/{repo}/pulls?state=open&per_page=100&page={n}`
- Stop when page returns empty

**Daily Sync:**

- Use `since={last_sync_at}` parameter (ISO 8601 format)
- Still paginate if >100 items updated
- GitHub returns items sorted by updated_at ascending

## Next Steps

1. ~~Answer open questions~~ ✓ Done
2. ~~Simplify to single vector object per repo~~ ✓ Done
3. ~~Define backfill and deletion strategy~~ ✓ Done
4. Create D1 table schema
5. Implement backfill worker
6. Implement daily sync scheduled worker
7. Implement repository management API endpoints
8. Build frontend vector fetching and rendering
