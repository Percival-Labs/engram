# Status

Display the current state of the work queue.

## Steps

1. **Read queue** -- Load `MEMORY/STATE/work-queue.json`. If missing or empty, report "Queue is empty -- no items captured yet"
2. **Group by status** -- Categorize items into: pending, in_progress, completed, failed
3. **Display summary** -- Present a summary table and item details

## Output Format

```markdown
## Work Queue Status

| Status | Count |
|--------|-------|
| Pending | X |
| In Progress | X |
| Completed | X |
| Failed | X |
| **Total** | **X** |

### Pending (by priority)
- [HIGH] #3: Refactor auth module
- [MEDIUM] #5: Update documentation
- [LOW] #1: Clean up unused imports

### In Progress
- #4: Migrate database schema (started: 2025-01-15 10:30)

### Recently Completed
- #2: Fix login bug (completed: 2025-01-15 09:15)
```

## Verification

- [ ] All items in queue are accounted for
- [ ] Pending items are sorted by priority (high first)
- [ ] Timestamps are shown in human-readable format
