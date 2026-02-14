# WorkLoop

Process items from the work queue in priority order.

## Steps

1. **Read queue** -- Load `MEMORY/STATE/work-queue.json`. If empty or missing, inform user there is nothing to process
2. **Select item** -- Pick the highest-priority item with status "pending". Priority order: high > medium > low. Within the same priority, pick the oldest (lowest id)
3. **Mark in-progress** -- Set the item's status to "in_progress" and `started_at` to current timestamp. Write back to queue file
4. **Execute** -- Perform the work described in the item. Use all available tools and skills as needed to complete the task
5. **Mark completed** -- Set the item's status to "completed" and `completed_at` to current timestamp. Write back to queue file
6. **Report** -- Summarize what was done for this item
7. **Continue?** -- Check if more pending items exist. If yes, ask the user: "Next item is: [title] ([priority]). Continue?" If user confirms, go to step 2

## Error Handling

- If execution fails partway through, set status to "failed" with a `failure_reason` field
- Do not skip failed items silently -- report the failure and ask for guidance
- Never mark an item completed unless the work is actually done

## Verification

- [ ] Only one item is in_progress at a time
- [ ] Items are processed in priority order (high first)
- [ ] Queue file is updated after each status change
- [ ] User is asked before proceeding to next item
