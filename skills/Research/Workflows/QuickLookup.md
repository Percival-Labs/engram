# QuickLookup

Fast factual lookup. Optimized for speed and precision on questions with direct answers.

## Steps

1. **Identify the core question** -- Distill the user's request into a single, precise factual question
2. **Search** -- Execute 1-2 targeted web searches using specific, well-formed queries
3. **Extract** -- Pull the direct answer from the most authoritative source
4. **Respond** -- Return a concise answer (1-3 sentences) with:
   - The factual answer
   - Source URL(s)
   - Date of information (to flag staleness)

## Output Format

```
**Answer**: [Direct answer]

**Source**: [URL]
**As of**: [Date of source]
```

## Verification

- [ ] Answer directly addresses the question asked
- [ ] At least one source URL is included
- [ ] Answer is concise (not a wall of text for a simple question)
