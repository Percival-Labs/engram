# Memory System Specification

**The Harness Framework -- Cross-Session Persistence & Learning**

---

## Overview

The Memory system gives AI persistent knowledge across sessions. Without memory, every session starts from zero. With memory, each session builds on the accumulated knowledge of every previous session. Memory is what transforms a stateless model into a persistent collaborator.

All memory is stored as plain files in the filesystem. No database, no cloud dependency, no proprietary format. Files are human-readable, git-friendly, and portable.

---

## Directory Structure

```
MEMORY/
├── WORK/                    # Session work directories
│   └── YYYY-MM-DD/
│       └── session-id/
│           ├── META.yaml    # Session metadata
│           ├── summary.md   # Session summary (auto-generated)
│           └── artifacts/   # Any outputs produced
├── LEARNING/                # Extracted learnings
│   ├── topics/              # Learnings organized by topic
│   │   └── topic-name.md
│   └── SIGNALS/
│       └── ratings.jsonl    # Quality/sentiment signals
├── STATE/                   # Current session state
│   ├── current-work.json    # What is in progress right now
│   └── progress/            # Tracked progress on ongoing work
│       └── task-id.json
└── SECURITY/                # Security audit logs
    └── YYYY/
        └── MM/
            └── audit.jsonl  # Security events
```

---

## WORK/ -- Session Work Directories

Each AI session produces a work directory that captures what happened during that session.

### Directory Naming

```
WORK/
└── 2026-02-13/
    ├── a1b2c3d4/           # Session ID (short hash)
    │   └── META.yaml
    └── e5f6g7h8/           # Another session same day
        └── META.yaml
```

### META.yaml Format

Every session work directory contains a `META.yaml` file:

```yaml
session_id: a1b2c3d4
date: 2026-02-13
started: "2026-02-13T09:15:00Z"
ended: "2026-02-13T10:42:00Z"
status: COMPLETED           # ACTIVE | COMPLETED | ABANDONED
project: my-project
branch: feature/auth

summary: |
  Implemented JWT authentication middleware.
  Added token refresh endpoint.
  All 12 tests passing.

tags:
  - authentication
  - middleware
  - api

artifacts:
  - src/middleware/auth.ts
  - src/routes/auth/refresh.ts
  - tests/auth.test.ts
```

### Work Lifecycle

Sessions move through a defined lifecycle:

```
ACTIVE --> COMPLETED
  |
  +--> ABANDONED (session ended without completion)
```

| Status | Meaning | Set By |
|--------|---------|--------|
| `ACTIVE` | Session is in progress | SessionStart hook |
| `COMPLETED` | Session finished normally with a summary | Stop hook |
| `ABANDONED` | Session ended without proper cleanup | Next SessionStart (detects stale ACTIVE) |

### Retention Policy

- **Last 7 days:** Full work directories retained
- **8-30 days:** META.yaml retained, artifacts pruned
- **31+ days:** Archived or deleted (configurable)

Retention is handled by a maintenance hook or CLI command (`harness memory prune`), not automatically.

---

## LEARNING/ -- Extracted Learnings

Learnings are insights extracted from work sessions and captured for future reference. They represent the system's accumulated knowledge.

### Topic Files

Learnings are organized by topic in markdown files:

```markdown
# Authentication

## JWT Token Handling
- Access tokens expire in 15 minutes, refresh tokens in 7 days
- Store refresh tokens in httpOnly cookies, never localStorage
- Token refresh endpoint must be rate-limited (max 10/minute)

## OAuth2 Integration
- Always validate the `state` parameter to prevent CSRF
- Use PKCE flow for public clients (SPAs, mobile apps)
- Token exchange must happen server-side, never in the browser
```

### Writing Learnings

Learnings MUST be written as facts, not narratives:

| Good | Bad |
|------|-----|
| "PostgreSQL JSONB indexes require GIN, not B-tree" | "Today I learned that JSONB needs a different index" |
| "Next.js API routes with POST export are auto-detected as dynamic" | "We discovered that the API route was being statically rendered" |
| "Use `uint8Array as BlobPart` for strict TypeScript" | "I had a type error with Uint8Array and Blob" |

### SIGNALS/ -- Quality Signals

Quality signals track how well the AI performed across sessions. These feed back into skill refinement.

```
SIGNALS/
└── ratings.jsonl
```

**ratings.jsonl format (one JSON object per line):**

```json
{"session_id": "a1b2c3d4", "date": "2026-02-13", "skill": "CodeReview", "rating": 4, "signal": "positive", "note": "Caught the race condition"}
{"session_id": "e5f6g7h8", "date": "2026-02-13", "skill": "Research", "rating": 2, "signal": "negative", "note": "Missed key competitor in analysis"}
```

| Field | Type | Description |
|-------|------|-------------|
| `session_id` | string | Which session this rating is from |
| `date` | string | ISO date |
| `skill` | string | Which skill was being used |
| `rating` | number | 1-5 quality rating |
| `signal` | string | `positive`, `negative`, or `neutral` |
| `note` | string | Brief explanation of the rating |

---

## STATE/ -- Current Session State

State files track what is currently in progress. These are the bridge between sessions -- they tell the next session what the previous session was working on.

### current-work.json

```json
{
  "updated": "2026-02-13T10:42:00Z",
  "active_tasks": [
    {
      "id": "task-001",
      "description": "Implement user authentication flow",
      "status": "in_progress",
      "started": "2026-02-13T09:15:00Z",
      "project": "my-project",
      "branch": "feature/auth",
      "blockers": [],
      "next_steps": [
        "Add password reset endpoint",
        "Write integration tests for login flow"
      ]
    }
  ],
  "completed_today": [
    {
      "id": "task-000",
      "description": "Set up project structure and database schema",
      "completed": "2026-02-13T09:10:00Z"
    }
  ]
}
```

### progress/ Directory

For long-running tasks that span multiple sessions, individual progress files track detailed state:

```json
{
  "task_id": "task-001",
  "title": "Implement user authentication flow",
  "created": "2026-02-12T14:00:00Z",
  "sessions": ["x1y2z3", "a1b2c3d4"],
  "checkpoints": [
    {"date": "2026-02-12", "note": "Database schema and User model created"},
    {"date": "2026-02-13", "note": "JWT middleware and refresh endpoint done"}
  ],
  "remaining": [
    "Password reset flow",
    "Integration tests",
    "Rate limiting"
  ]
}
```

---

## SECURITY/ -- Audit Logs

Security-relevant events are logged in append-only JSONL files organized by year and month.

```
SECURITY/
└── 2026/
    └── 02/
        └── audit.jsonl
```

**audit.jsonl format:**

```json
{"ts": "2026-02-13T09:30:15Z", "event": "tool_blocked", "tool": "Bash", "command": "rm -rf /", "reason": "Blocked by SecurityValidator hook"}
{"ts": "2026-02-13T09:45:22Z", "event": "confirm_prompted", "tool": "Bash", "command": "git push --force origin main", "reason": "Force push to protected branch"}
{"ts": "2026-02-13T10:12:08Z", "event": "path_access_denied", "path": "~/.ssh/id_rsa", "reason": "Zero-access path protection"}
```

These logs are append-only and MUST NOT be modified or deleted by the AI. They provide an immutable audit trail for security review.

---

## Memory Maintenance

### Pruning

Over time, memory accumulates and must be maintained:

```bash
# Prune old work directories (keep last 30 days)
harness memory prune --older-than 30d

# Compact learning files (summarize and deduplicate)
harness memory compact

# Archive completed work to a separate location
harness memory archive --before 2026-01-01
```

### Summarization

When MEMORY.md or topic files exceed 200 lines, they should be summarized:

1. Extract the key facts that are still relevant
2. Remove entries that are no longer applicable
3. Condense related entries into single statements
4. Archive the original file before overwriting

### Integrity

- Memory files MUST be valid markdown, YAML, or JSON (no mixed formats)
- JSONL files MUST have exactly one valid JSON object per line
- META.yaml MUST include all required fields (session_id, date, status)
- File paths in artifacts lists MUST be relative to the project root
