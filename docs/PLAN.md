# GitHub Issue and Pull Request Vectorization Architecture

This document outlines the system for indexing GitHub repositories, generating text embeddings, and serving the vector data to a frontend. The architecture relies on the Cloudflare ecosystem to minimize costs and scale to thousands of repositories.

**Status: Work in Progress** - This plan reflects the current state of the codebase. Some features described in the original architecture have not yet been implemented.

## Core Infrastructure

**Cloudflare D1** stores repository metadata:

- Repository identification (`owner`/`repo`)
- Last sync timestamp
- Created/updated timestamps

**Cloudflare R2** holds the actual vector data:

- **One vector object per repository** - no snapshots, no history
- Object is overwritten on each sync
- Cheap storage with zero-cost egress

**Cloudflare Pages** hosts the static web application.

**Cloudflare Workers** is the backend service:

- HTTP endpoints for repository management and sync
- Built with Hono framework

## Current Implementation

### D1 Schema

```sql
repositories
- id INTEGER PRIMARY KEY AUTOINCREMENT
- owner TEXT NOT NULL
- repo TEXT NOT NULL
- lastSyncAt INTEGER NOT NULL DEFAULT 0
- createdAt INTEGER NOT NULL
- updatedAt INTEGER NOT NULL

UNIQUE(owner, repo)
```

**Notes:**

- No status field (pending/backfilling/syncing/active/error) - just `lastSyncAt`
- No error tracking per repository
- Simpler than originally planned

### R2 Storage Layout

```
{owner}/{repo}.json.gz
```

Examples:

- `facebook/react.json.gz`
- `vercel/next.js.json.gz`

Each file is the **only** vector data for that repository. Format: JSON compressed with gzip.

### Vector Object Structure

Each repository has exactly one vector object in R2, stored as gzipped JSON:

```typescript
interface VectorObject {
  repo: string // "owner/repo" format
  syncedAt: number // Unix timestamp of last sync
  issues: { [id: string]: IssueVector }
  pullRequests: { [id: string]: PullRequestVector }
}

interface IssueVector {
  id: string // GitHub GraphQL node ID
  number: number
  state: "open" | "closed"
  vector: number[] // embedding dimensions
}

interface PullRequestVector extends IssueVector {
  hash: string // SHA256 hash for change detection
}
```

**Current Limitations:**

- Vector objects only store `id`, `number`, `state`, and `vector`
- Missing: title, body, author, labels, createdAt, updatedAt, mergedAt
- Planned to add full metadata for display purposes

## API Structure

Built with Hono framework using RPC client for type-safe API calls.

### Endpoints

**List Repositories**

```
GET /api/repositories
Response: { data: [{ id, owner, repo, lastSyncAt, createdAt, updatedAt }] }
```

**Get Repository**

```
GET /api/repositories/:owner/:repo
Response: { id, owner, repo, lastSyncAt, createdAt, updatedAt }
```

**Add Repository**

```
POST /api/repositories
Body: { repoUrl: "https://github.com/owner/repo" }
Response: { id, owner, repo, lastSyncAt, createdAt, updatedAt }
Note: Creates D1 row only, does not trigger sync
```

**Sync Repository**

```
POST /api/repositories/:owner/:repo/sync
Response: { repo, lastSyncAt, issuesCount, pullRequestsCount }
Note: Fetches data from GitHub, generates embeddings, writes to R2
```

### Authentication

Protected endpoints use Better Auth with GitHub OAuth:

- `POST /api/repositories` - Requires authentication
- `POST /api/repositories/:owner/:repo/sync` - Requires authentication
- `GET /api/repositories*` - Public

## Sync Implementation

### Current State

The sync endpoint is functional but minimal:

1. **Fetches from GitHub GraphQL API**:
   - Uses GitHub's GraphQL API (not REST)
   - Fetches 1 issue (with `since` filter if `lastSyncAt > 0`)
   - Fetches 1 open PR
   - Fetches file paths for each PR

2. **Generates embeddings**:
   - Uses Ollama with `embeddinggemma` model (not Gemini)
   - Issue text: `title + "\n\n" + body`
   - PR text: `title + "\n\n" + body + "\n\n" + filePaths`

3. **Updates R2**:
   - Merges with existing vector object (if exists)
   - Applies content-hash diffing for PRs (skip if hash matches)
   - Compresses with gzip
   - Writes to R2

4. **Updates D1**:
   - Sets `lastSyncAt` to current timestamp

### Limitations

- **No pagination**: Only fetches 1 item per sync call
- **No deletion logic**: Closed items are not removed from vector object yet
- **No batch processing**: Each sync processes minimal data
- **Manual only**: No automatic sync or cron triggers

### Planned Improvements

1. Pagination support (100 items per page)
2. Full backfill on first sync (all open items)
3. Deletion of closed/merged items
4. Status field for progress tracking
5. Error handling and retry logic

## Frontend

Built with:

- **Vite** + **React**
- **TanStack Start** (file-based routing)
- **TanStack Query** (data fetching)
- **Tailwind CSS v4** + **shadcn/ui**

### Pages

**Home** (`/`)

- Lists all repositories
- Search/filter functionality
- Shows "Queued" if `lastSyncAt === 0`, otherwise relative time

**Repository Detail** (`/repos/:owner/:repo`)

- Shows repository info
- Displays last sync time
- "Update repo" button to trigger sync

**Submit** (`/submit`)

- Form to add new repository
- Validates GitHub URL format
- Requires authentication

### Data Flow

1. User submits repo URL → POST `/api/repositories` → D1 row created
2. User clicks "Update repo" → POST `/api/repositories/:owner/:repo/sync`
3. Frontend polls repo data to check `lastSyncAt`
4. Vector data fetched directly from R2 (not yet implemented in UI)

## Architecture Decisions (Implemented)

### 1. Hono RPC for Type-Safe API

- Frontend uses `hc<AppType>()` from Hono client
- Full end-to-end type safety between API and frontend
- No manual type definitions needed

### 2. GraphQL over REST

- Using GitHub GraphQL API for efficient data fetching
- Single query gets issues, PRs, and file paths
- Can filter issues by `since` timestamp

### 3. Content Hashing for PRs

- Store SHA256 hash of PR content
- Skip re-embedding if content hasn't changed
- Saves embedding API costs

### 4. Manual Sync Only

- No cron triggers or automatic sync
- User controls when to refresh data
- Simple for MVP

## What's Working

- Repository submission and storage in D1
- Manual sync endpoint (minimal implementation)
- Embedding generation via Ollama
- Vector storage in R2 with gzip compression
- Basic frontend with repo list and sync button
- GitHub OAuth authentication

## What's Not Yet Implemented

From the original plan:

1. **Pagination** - Only fetches 1 item at a time
2. **Full backfill** - Doesn't fetch all open items on first sync
3. **Deletion logic** - Closed items remain in vector object
4. **Status tracking** - No pending/backfilling/syncing/active/error states
5. **Error handling** - No per-repo error messages or retry logic
6. **Full metadata** - Vector objects missing title, body, author, labels, etc.
7. **Vector visualization** - Frontend doesn't fetch or display vectors yet
8. **Automatic sync** - No cron or scheduled sync
9. **Batch embedding** - Embeddings generated one at a time

## Next Steps

1. Implement pagination for large repositories
2. Add full backfill on first sync (fetch all open issues/PRs)
3. Add deletion logic for closed/merged items
4. Expand vector object to include full metadata
5. Build vector search/visualization UI
6. Add status field for better progress tracking
7. Consider batch embedding for efficiency
8. Add repository removal endpoint

## Data Flow Summary (Current)

```
Add Repository:
  Frontend POST /api/repositories {repoUrl} →
    Parse URL → Insert D1 row → Return repo data

Sync Repository:
  Frontend POST /api/repositories/:owner/:repo/sync →
    Check if exists in D1 →
    Fetch from GitHub GraphQL (1 issue, 1 PR) →
    Generate embeddings (if needed) →
    Fetch existing vector object from R2 →
    Merge updates →
    Write compressed object to R2 →
    Update D1 lastSyncAt →
    Return sync stats

Frontend Display:
  Load page → GET /api/repositories → List repos →
    Click repo → GET /api/repositories/:owner/:repo → Show details →
    Click "Update repo" → Trigger sync → Poll for updates
```
