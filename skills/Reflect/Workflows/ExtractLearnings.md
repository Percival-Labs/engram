# ExtractLearnings

Review the current session and extract actionable learnings.

## Steps

1. **Review** -- Scan the conversation history for this session. Focus on:
   - Problems that were solved (what was the obstacle, what was the fix)
   - Approaches that worked well (techniques, tool usage, strategies)
   - Mistakes or dead ends (what was tried and failed, why)
   - New patterns discovered (reusable solutions, configuration tricks, API behaviors)
   - Surprising findings (things that contradicted expectations)

2. **Classify** -- For each learning, assign:
   - `category`: One of: debugging, architecture, tooling, workflow, domain-knowledge, performance, testing, configuration
   - `learning`: A concise statement of what was learned (1-2 sentences)
   - `evidence`: The specific example from the session that demonstrates this learning
   - `actionability`: high (immediately reusable), medium (useful in similar contexts), low (good to know)

3. **Filter** -- Discard learnings that are:
   - Too vague to act on ("TypeScript is useful")
   - Already well-known general knowledge
   - Specific to a one-time situation with no transferable value

4. **Persist** -- Append each learning as a JSON object (one per line) to `MEMORY/LEARNING/learnings.jsonl`. Create the file and directories if they do not exist. Each entry includes:
   - `timestamp`: Current ISO 8601 timestamp
   - `category`, `learning`, `evidence`, `actionability` (from step 2)

5. **Present** -- Display a summary of extracted learnings to the user

## Learning Entry Schema

```json
{
  "timestamp": "2025-01-15T14:30:00Z",
  "category": "debugging",
  "learning": "pdfjs-dist v5 evaluates DOMMatrix at import time, breaking SSR builds",
  "evidence": "Next.js build failed with ReferenceError: DOMMatrix is not defined. Fixed by wrapping all pdfjs imports in dynamic import()",
  "actionability": "high"
}
```

## Output Format

```markdown
## Session Learnings

### High Actionability
1. **[category]**: [learning]
   _Evidence_: [evidence]

### Medium Actionability
1. **[category]**: [learning]
   _Evidence_: [evidence]

### Low Actionability
1. **[category]**: [learning]
   _Evidence_: [evidence]

---
Captured X learnings to MEMORY/LEARNING/learnings.jsonl
```

## Verification

- [ ] Output includes specific examples, not just abstractions
- [ ] Each learning has an actionability rating
- [ ] Learnings are appended, not overwritten
- [ ] Vague or non-transferable items are filtered out
