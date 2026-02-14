# Compare

Side-by-side comparison of 2-4 options. Produces a structured evaluation with a recommendation.

## Steps

1. **Identify options** -- Confirm the 2-4 options being compared. If unclear, ask the user to clarify
2. **Define criteria** -- Determine 4-6 comparison criteria based on the user's context. Include both objective (performance, cost, features) and subjective (ease of use, community, documentation) dimensions
3. **Research** -- Investigate each option against every criterion. Use targeted searches for each option+criterion pair
4. **Tabulate** -- Present findings in a comparison table
5. **Recommend** -- Provide a clear recommendation with reasoning, including "it depends" conditions if appropriate

## Output Format

```markdown
## Comparison: [Option A] vs [Option B] vs ...

### Criteria
| Criterion | [Option A] | [Option B] | [Option C] |
|-----------|------------|------------|------------|
| [Criterion 1] | [Rating/detail] | [Rating/detail] | [Rating/detail] |
| [Criterion 2] | [Rating/detail] | [Rating/detail] | [Rating/detail] |
...

### Analysis
[Key differentiators and trade-offs]

### Recommendation
**Choose [Option X] if** [conditions]
**Choose [Option Y] if** [conditions]

### Sources
- [Source URLs]
```

## Verification

- [ ] All options are evaluated against the same criteria (no gaps)
- [ ] Ratings include evidence, not just opinions
- [ ] Recommendation acknowledges trade-offs
- [ ] Comparison table is scannable at a glance
