# VerifyChain

Validate the integrity of the hash-chained audit trail.

## Steps

1. **Load chain** — Read all entries from MEMORY/AUDIT/chain.jsonl
2. **Verify genesis** — First entry should have prev_hash = "genesis"
3. **Walk chain** — For each entry, verify:
   - hash matches SHA-256(entry_content + prev_hash)
   - prev_hash matches previous entry's hash
4. **Report** — Show chain status

## Output Format

```
Audit Chain Verification
========================
Total entries: {N}
First entry: {timestamp}
Last entry: {timestamp}
Chain status: VALID / BROKEN at entry {N}

If broken:
  Entry {N}: expected hash {expected}, got {actual}
  This may indicate tampering or data corruption.
```
