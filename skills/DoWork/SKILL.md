---
name: DoWork
description: Queue-based task management with capture and autonomous execution. USE WHEN do work OR capture request OR work queue OR start working OR queue status OR process requests. Manages a persistent task queue.
---

# DoWork

Persistent task queue for capturing, prioritizing, and executing work items. Tasks are stored in `MEMORY/STATE/work-queue.json` and survive across sessions.

The queue supports three operations:
- **Capture**: Add new work items with priority
- **WorkLoop**: Process items from highest to lowest priority
- **Status**: View current queue state

## Workflow Routing

| Intent | Workflow | When to use |
|--------|----------|-------------|
| Add a task | [Capture](Workflows/Capture.md) | User describes work to do later: "capture this", "add to queue", "remind me to", "I need to" |
| Process tasks | [WorkLoop](Workflows/WorkLoop.md) | User wants execution: "do work", "start working", "process the queue", "work on next item" |
| View queue | [Status](Workflows/Status.md) | User wants visibility: "queue status", "what's pending", "show work items", "what's in the queue" |

## Examples

**Example 1: Capturing a task**

> User: "I need to refactor the authentication module to use JWT tokens"

Routes to: `Capture` -- parses request, assigns priority, appends to work-queue.json, confirms with queue position.

**Example 2: Starting work**

> User: "Start working through the queue"

Routes to: `WorkLoop` -- reads queue, picks highest-priority unstarted item, executes it, marks complete, offers to continue.

**Example 3: Checking status**

> User: "What's in my work queue?"

Routes to: `Status` -- reads queue, groups by status, displays summary table with counts and priorities.
