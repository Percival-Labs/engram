# ExportAudit

Generate compliance-ready audit exports from the hash-chained audit trail.

## Steps

1. **Identify framework** — Which compliance framework (soc2, eu-ai-act, nist-ai-rmf, iso-42001)
2. **Set date range** — From/to dates for the export period
3. **Load audit chain** — Read from MEMORY/AUDIT/chain.jsonl
4. **Filter entries** — By date range and relevant fields
5. **Format output** — Structure data per framework requirements
6. **Write export** — Save to MEMORY/AUDIT/exports/{framework}-{date}.json
7. **Verify** — Confirm export file exists and entry count matches

## CLI Equivalent

```bash
engram compliance export <framework> --from <date> --to <date> --format json
```

## Output Format

Export file includes:
- Metadata: framework, date range, export timestamp, entry count
- Entries: filtered and formatted audit records
- Chain verification: hash of first and last entries in range
