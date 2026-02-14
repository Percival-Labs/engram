# Capture

Capture a work item to the persistent task queue.

## Steps

1. **Parse** -- Extract from the user's request:
   - `title`: Short summary (under 80 characters)
   - `description`: Full details of what needs to be done
   - `priority`: Infer from urgency/importance (low / medium / high). Default to medium if unclear
2. **Generate metadata** -- Create the queue entry:
   - `id`: Incrementing integer (max existing id + 1, or 1 if queue is empty)
   - `status`: "pending"
   - `created_at`: Current ISO 8601 timestamp
3. **Persist** -- Append the entry to `MEMORY/STATE/work-queue.json`. Create the file and directories if they do not exist
4. **Confirm** -- Report back to user:
   - Item title and assigned priority
   - Queue position (how many items ahead of it)

## Queue Entry Schema

```json
{
  "id": 1,
  "title": "Refactor auth module to use JWT",
  "description": "Replace session-based authentication with JWT tokens...",
  "priority": "high",
  "status": "pending",
  "created_at": "2025-01-15T10:30:00Z",
  "started_at": null,
  "completed_at": null
}
```

## Verification

- [ ] Entry is valid JSON and appended (not overwritten) to the queue
- [ ] Priority is one of: low, medium, high
- [ ] User receives confirmation with title and queue position
